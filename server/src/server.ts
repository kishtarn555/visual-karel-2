/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	integer,
	DocumentOnTypeFormattingRequest
} from 'vscode-languageserver/node';

import {
	Position,
	TextDocument
} from 'vscode-languageserver-textdocument';
import { Console } from 'console';

class functionInfo {
	name:string;
	parameter:string|null;
	constructor (n: string, p: string | null) {
		this.name=n;
		this.parameter=p;
	}
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let functions: functionInfo[] = [];
let funDict : Record<string, number> = {};
const instructions = ["move","turnleft", "turnoff", "putbeeper", "pickbeeper", "return"];
const keywords = ["class","program", "iterate","if", "else", "turnoff", "while" ];


connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(getFunctions);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	getFunctions(change.document);	
});
function error(start:number, end:number,  msg:string, textDocument:TextDocument) :Diagnostic{
	return {
		severity:DiagnosticSeverity.Error,
		source:"ex",
		message:msg,
		range:{
			start:textDocument.positionAt(start),
			end:textDocument.positionAt(end)
		}
	};
	
}
async function getFunctions(textDocument:TextDocument) : Promise<void> {
	const settings = await getDocumentSettings(textDocument.uri);

	functions=[];
	funDict={};
	const text = textDocument.getText();
	const regex = /\b(define|void)(\s+)([_a-zA-Z][_a-zA-Z0-9]*)\s*\(([_a-zA-Z][_a-zA-Z0-9]*)?\)/g;
	let m : RegExpExecArray|null;
	let problems =0;
	const diagnostics: Diagnostic[] = [];
	while((m = regex.exec(text))) {
		const funcname :string= m[3];
		const funcArg :string | null= m[4]!=""?m[4]:m[5];
		const funcNameIndex=m.index+m[1].length+m[2].length;
		if (Object.prototype.hasOwnProperty.call(funDict,funcname)) {
			if (problems < settings.maxNumberOfProblems) {
				problems++;
				diagnostics.push(
					error(funcNameIndex,funcNameIndex, `${funcname} fue definida anteriormente`,textDocument )
				);
			}
			continue;
		}
		if (keywords.indexOf(funcname)!=-1|| instructions.indexOf(funcname)!=-1) {
			if (problems < settings.maxNumberOfProblems) {
				problems++;
				diagnostics.push(
					error(
						funcNameIndex,
						funcNameIndex, 
						`${funcname} es una palabra reservada y no puede ser usada como nombre de una nueva instruccion.`, 
						textDocument
					)
				);
			}
			continue;
		}
		functions.push(
			new functionInfo(funcname, funcArg)
		);
		funDict[funcname]=functions.length-1;
	}	
	validateTextDocument(textDocument, diagnostics);
	connection.sendDiagnostics({uri: textDocument.uri,diagnostics});
}

function validateTextDocument(textDocument:TextDocument, diagnostics:Diagnostic[])  {
	const text = textDocument.getText();
	const pattern = /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\(\s*([^)]*)\s*\)/g;
	let m : RegExpExecArray | null;
	
	while ((m = pattern.exec(text))) {
		const name = m[1];
		const args = m[2];
		if (Object.prototype.hasOwnProperty.call(funDict, name)) {
			const f = functions[funDict[name]];
			if (f.parameter == null && args!="") {
				diagnostics.push(
					error(m.index, m.index, `${name} no espera parametros`,textDocument)
				);
			} else if(f.parameter != null && args=="") {
				diagnostics.push(
					error(m.index, m.index, `${name} espera un parametro`,textDocument)
				);
			}
			continue;
		}
		if (instructions.indexOf(name)!=-1) {
			if (args!="")
				diagnostics.push(
					error(m.index, m.index, `Las instrucciones no requiere parametros`,textDocument)
				);
			continue;
		} 
		if (keywords.indexOf(name)!=-1) {
			continue;
		}
		diagnostics.push(error(m.index, m.index, `${name} no fue declarada`,textDocument));
	}
	connection.sendDiagnostics({uri:textDocument.uri, diagnostics});
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		const suggestions = [
			{
				label: 'move',
				kind: CompletionItemKind.Method,
				data: 1
			},
			{
				label: 'turnleft',
				kind: CompletionItemKind.Method,
				data: 1
			},
			{
				label: 'turnoff',
				kind: CompletionItemKind.Method,
				data: 1
			},
			{
				label: 'putbeeper',
				kind: CompletionItemKind.Method,
				data: 1
			},
			{
				label: 'pickbeeper',
				kind: CompletionItemKind.Method,
				data: 1
			},
			{
				label: 'succ',
				kind: CompletionItemKind.Method,
				data: 2
			},
			{
				label: 'pred',
				kind: CompletionItemKind.Method,
				data: 2
			},
			{
				label: 'iszero',
				kind: CompletionItemKind.Method,
				data: 3
			},
			{
				label: 'iterate',
				kind: CompletionItemKind.Keyword,
				data: 3
			}
		];
		functions.forEach((func, index)=>{
			suggestions.push({
				label: func.name,
				kind: CompletionItemKind.Method,
				data:15
			});
		});
		return suggestions;
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		const labeldocs: {[id:string]:string} = {
			"move": "Karel avanza hacia donde esta orientado.",
			"turnleft": "Karel gira 90° en sentido contra-horario.",
			"turnoff": "Karel termina y no ejecutara ninguna instruccion más.",
			"pickbeeper": "Karel toma un zumbador del suelo y lo pone en su mochila.",
			"putbeeper": "Karel deja un zumbador en el suelo de su mochila."
		};
		switch (item.data){
			case 1:				
				item.detail = 'instruccion de karel';
				item.documentation=labeldocs[item.label];
				break;
			case 2:
				item.detail = 'operador numerico';
				break;
			case 3:
				item.detail = 'iszero';
				item.documentation = 'Regrese verdaderro si el numero es cero';
				break;			
			case 4:
				item.detail = 'detalles de putbeeper';
				item.documentation = 'Deja un zumbador de la mochila en el suelo';
				break;			
		}

		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
