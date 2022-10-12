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
	InitializeResult
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let functions: string[] = [];

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
	documents.all().forEach(validateTextDocument);
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
	validateTextDocument(change.document);
	getFunctions(change.document);
});

function getFunctions(textDocument:TextDocument) {
	functions=[];
	const text = textDocument.getText();
	const regex = /\\b[_a-zA-Z][_a-zA-Z0-9]*\\b/g;
	const words = text.match(regex);
	words?.forEach((text, index) => {		
		if (index==0) 
			return;
		if (words[index-1]=="define"||words[index-1]=="void") {
			functions.push(text);
		}
	});
	
}
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);


	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	
	const validCharacters = /[a-zA-Z0-9;()_/*&!|{}]|\s/;
	for (let i = 0; i < text.length && problems < settings.maxNumberOfProblems; i++) {
		if (!validCharacters.test(text[i].toString()))	{
			problems++;
			const diagnostic: Diagnostic= {
				severity: DiagnosticSeverity.Error,
				range: {
					start: textDocument.positionAt(i),
					end: textDocument.positionAt(i)
				},
				source: "karelserver",
				message:`Caracter ilegal: '${text[i]}'`					
			};
			if (hasDiagnosticRelatedInformationCapability) {
				diagnostic.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: Object.assign({}, diagnostic.range)
						},
						message: ''
					}
				];
			}
			diagnostics.push(diagnostic);
		}
	}
	

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
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
				data: 2
			},
			{
				label: 'turnoff',
				kind: CompletionItemKind.Method,
				data: 3
			},
			{
				label: 'putbeeper',
				kind: CompletionItemKind.Method,
				data: 4
			},
			{
				label: 'pickbeeper',
				kind: CompletionItemKind.Method,
				data: 5
			},
			{
				label: 'succ',
				kind: CompletionItemKind.Method,
				data: 6
			},
			{
				label: 'pred',
				kind: CompletionItemKind.Method,
				data: 7
			},
			{
				label: 'iszero',
				kind: CompletionItemKind.Method,
				data: 7
			}
		];
		functions.forEach((func, index)=>{
			suggestions.push({
				label: func,
				kind: CompletionItemKind.Method,
				data:0
			});
		});
		return suggestions;
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		switch (item.data){
			case 1:
				item.detail = 'detalles de move';
				item.documentation = 'Mueve a Karel';
				break;
			case 2:
				item.detail = 'detalles de turnleft';
				item.documentation = 'Gira a Karel 90° a la izquierda';
				break;
			case 3:
				item.detail = 'detalles de turnleft';
				item.documentation = 'Termina la ejecución de Karel';
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
