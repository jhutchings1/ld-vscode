import { WorkspaceConfiguration, workspace, ExtensionContext, ConfigurationChangeEvent } from 'vscode';

const package_json = require('../package.json');

const DEFAULT_BASE_URI = 'https://app.launchdarkly.com';
const DEFAULT_STREAM_URI = 'https://stream.launchdarkly.com';

export class Configuration {
	private readonly ctx: ExtensionContext;
	accessToken = '';
	sdkKey = '';
	project = '';
	env = '';
	enableHover = true;
	enableAutocomplete = true;
	enableFlagExplorer = true;
	baseUri = DEFAULT_BASE_URI;
	streamUri = DEFAULT_STREAM_URI;

	constructor(ctx: ExtensionContext) {
		this.ctx = ctx;
		this.reload();
	}

	reload() {
		const config = workspace.getConfiguration('launchdarkly');
		for (const option in this) {
			if (option === 'ctx') {
				continue;
			}
			this[option] = config.get(option);
		}

		// If accessToken is configured in state, use it. Otherwise, fall back to the legacy access token.
		this.accessToken = this.getState('accessToken') || this.accessToken;
	}

	async update(key: string, value: string | boolean, global: boolean) {
		if (typeof this[key] !== typeof value) {
			return;
		}

		let config: WorkspaceConfiguration = workspace.getConfiguration('launchdarkly');
		if (key === 'accessToken') {
			const ctxState = global ? this.ctx.globalState : this.ctx.workspaceState;
			await ctxState.update(key, value);
			await config.update(key, '', global);
			return;
		}

		await config.update(key, value, global);
		config = workspace.getConfiguration('launchdarkly');

		this[key] = value;
		process.nextTick(function() {});
	}

	public streamingConfigReloadCheck(e: ConfigurationChangeEvent): boolean {
		let streamingConfigOptions = ['accessToken', 'baseUri', 'streamUri', 'project', 'env'];
		if (streamingConfigOptions.every(option => !e.affectsConfiguration(`launchdarkly.${option}`))) {
			console.warn('LaunchDarkly extension is not configured. Language support is unavailable.');
			return true;
		}
		return false;
	}

	public streamingConfigStartCheck(): boolean {
		let streamingConfigOptions = ['accessToken', 'baseUri', 'streamUri', 'project', 'env'];
		if (!streamingConfigOptions.every(o => !!this[o])) {
			console.warn('LaunchDarkly extension is not configured. Language support is unavailable.');
			return false;
		}
		return true;
	}

	validate(): string {
		const version = package_json.version;
		const ctx = this.ctx;
		ctx.globalState.update('version', undefined);
		const storedVersion = ctx.globalState.get('version');
		const project = ctx.globalState.get('project') || ctx.workspaceState.get('project');
		const env = ctx.globalState.get('env') || ctx.workspaceState.get('env');

		if (version !== storedVersion) {
			ctx.globalState.update('version', version);
		}

		const legacyConfiguration = !!this.sdkKey;
		if (legacyConfiguration && !ctx.globalState.get('legacyNotificationDismissed')) {
			return 'legacy';
		}

		// Only recommend configuring the extension on install and update
		const configured = !!this.accessToken;
		if (version != storedVersion && !configured) {
			return 'unconfigured';
		}

		if (!project || !env) {
			return 'unconfigured';
		}
	}

	getState(key: string): string {
		return this.ctx.workspaceState.get(key) || this.ctx.globalState.get(key);
	}

	setState(key: string) {
		return this.ctx.globalState.update(key, undefined);
	}
}
