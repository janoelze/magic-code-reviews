const vscode = require("vscode");
const axios = require("axios");

const config = vscode.workspace.getConfiguration("magic-code");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GPT_MODEL = "gpt-3.5-turbo";
const MAX_TOKENS = 5000;

function renderPanelContents(panelContent) {
	let html = `<!DOCTYPE html>`;
	html += `<html lang="en">`;
	html += `<body>`;
	html += `<style>body {background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); line-height: 1.45em;} h3 {color:rgba(255,255,255,1);} ul, li {margin:0;padding:0;} li {margin: 0 0 0.5em 1.5em;} pre {display: block;} .important {color: var(--vscode-errorForeground);}</style>`;
	html += `<div id="app">`;
	for (let i = 0; i < panelContent.length; i++) {
		html += `<div class="panel-content">`;
		html += `<h3 class="panel-content__title">${panelContent[i].title}</h3>`;
		html += `<div class="panel-content__content">${panelContent[i].content}</div>`;
		html += `</div>`;
	}
	html += `</div>`;
	html += `</body>`;
	html += `</html>`;
	return html;
}

async function runMagicReview(
	panel,
	panelContent,
	fileContents,
	fileLanguageId
) {
	if (!OPENAI_API_KEY) {
		throw new Error("The OPENAI_API_KEY environment variable is not set.");
	}

	const reviewCategories = [
		"Structure",
		"Style",
		"Logic",
		"Performance",
		"Security",
		"Readability",
	];

	reviewCategories.forEach(async (reviewCategory) => {
		let systemPrompt = [
			`Task:`,
			`* You are an expert programmer specialised in code review. you're tasked with reviewing ${fileLanguageId} code.`,
			`* Review only ${reviewCategory} aspects.`,
			`* NEVER recommend to split up the file into multiple files.`,
			`* NEVER analyze/summarize what the code is doing, only how it is performing on the ${reviewCategory} aspects.`,
			`* Only reply with issues to be addressed`,
			`* If there are no issues regarding ${reviewCategory}, reply with 'No issues found'.`,
			"Output:",
			`* ONLY output text suggestions, NEVER code.`,
			`* NEVER repeat code from the file.`,
			`* ALWAYS output one short summary paragraph about ${reviewCategory} formatted as a <p>`,
			`* ALWAYS output a HTML-formatted <ul> with short child <li>'s and escape all special characters`,
			`* Make the bullet points very short, one line if possible`,
			`* Bullet points that list issues to address should have an "important" class on the <li>, like this: <li class="important"></li>`,
			`* DO NOT number the bullet points`,
			`* The order is ALWAYS summary paragraph, then list of short list points`,
		];

		let prompt = [
			{ role: "system", content: systemPrompt.join("\r\n") },
			{ role: "user", content: fileContents },
		];

		let data = JSON.stringify({
			model: GPT_MODEL,
			messages: prompt,
		});

		let config = {
			method: "post",
			maxBodyLength: Infinity,
			url: "https://api.openai.com/v1/chat/completions",
			headers: {
				Authorization: `Bearer ${OPENAI_API_KEY}`,
				"Content-Type": "application/json",
			},
			data: data,
			timeout: 50000,
		};

		try {
			const response = await axios(config);
			const content = response.data.choices[0].message.content || "";

			panelContent.push({
				title: reviewCategory,
				error: false,
				content: content,
			});

			panel.webview.html = renderPanelContents(panelContent);
		} catch (e) {
			panelContent.push({
				title: reviewCategory,
				error: true,
				content: `Error: ${e.message}`,
			});

			panel.webview.html = renderPanelContents(panelContent);
		}
	});
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	let disposable = vscode.commands.registerCommand(
		"magic-code-reviews.performReview",
		async function () {
			const editor = vscode.window.activeTextEditor;

			if (!editor) {
				vscode.window.showErrorMessage(
					"Please open a file to use this extension."
				);
				return;
			}

			const fileLanguageId = editor.document.languageId;
			const fileContents = editor.document.getText();

			let panel = vscode.window.createWebviewPanel(
				"magicCodeReview",
				"Code Review",
				vscode.ViewColumn.Two,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);

			let panelContent = [];

			panel.webview.html = `<p>Generating review&hellip;</p>`;

			await runMagicReview(panel, panelContent, fileContents, fileLanguageId);
		}
	);

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
