"use strict";
/**
 * Workflow Kit - Main Loop
 * The autonomous development loop that orchestrates model selection, execution, and exit detection
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutopilotLoop = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const model_selector_1 = require("./model-selector");
const rate_limiter_1 = require("./rate-limiter");
const exit_detector_1 = require("./exit-detector");
const STATUS_FILE = 'status.json';
const LOG_DIR = 'logs';
const DEFAULT_CONFIG = {
    promptFile: 'PROMPT.md',
    fixPlanFile: '@fix_plan.md',
    maxLoops: 1000,
    pauseBetweenLoops: 5000,
    verbose: false
};
// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    purple: '\x1b[35m',
    cyan: '\x1b[36m'
};
function log(level, message) {
    const timestamp = new Date().toISOString();
    let color = colors.reset;
    switch (level) {
        case 'INFO':
            color = colors.blue;
            break;
        case 'WARN':
            color = colors.yellow;
            break;
        case 'ERROR':
            color = colors.red;
            break;
        case 'SUCCESS':
            color = colors.green;
            break;
        case 'LOOP':
            color = colors.purple;
            break;
        case 'MODEL':
            color = colors.cyan;
            break;
    }
    console.log(`${color}[${timestamp}] [${level}] ${message}${colors.reset}`);
}
class AutopilotLoop {
    constructor(projectDir, config) {
        this.loopCount = 0;
        this.running = false;
        this.projectDir = projectDir;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rateLimiter = new rate_limiter_1.RateLimiter(projectDir);
        this.exitDetector = new exit_detector_1.ExitDetector(projectDir);
        // Ensure log directory exists
        const logDir = path.join(projectDir, LOG_DIR);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }
    updateStatus(status) {
        const fullStatus = {
            loopCount: this.loopCount,
            currentModel: null,
            lastAction: '',
            status: 'running',
            exitReason: null,
            timestamp: new Date().toISOString(),
            ...status
        };
        const statusPath = path.join(this.projectDir, STATUS_FILE);
        fs.writeFileSync(statusPath, JSON.stringify(fullStatus, null, 2));
    }
    readPrompt() {
        const promptPath = path.join(this.projectDir, this.config.promptFile);
        if (!fs.existsSync(promptPath)) {
            throw new Error(`Prompt file not found: ${promptPath}`);
        }
        return fs.readFileSync(promptPath, 'utf-8');
    }
    getCurrentTask() {
        const fixPlanPath = path.join(this.projectDir, this.config.fixPlanFile);
        if (!fs.existsSync(fixPlanPath)) {
            return 'No fix plan found';
        }
        const content = fs.readFileSync(fixPlanPath, 'utf-8');
        const lines = content.split('\n');
        // Find first incomplete task
        for (const line of lines) {
            if (line.match(/^-\s*\[\s*\]/)) {
                return line.replace(/^-\s*\[\s*\]\s*/, '').trim();
            }
            if (line.match(/^-\s*\[\/\]/)) {
                return line.replace(/^-\s*\[\/\]\s*/, '').trim() + ' (in progress)';
            }
        }
        return 'All tasks may be complete';
    }
    async executeAntigravity(model, prompt) {
        return new Promise((resolve) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = path.join(this.projectDir, LOG_DIR, `output_${timestamp}.log`);
            log('MODEL', `Using: ${model.displayName}`);
            log('INFO', 'Executing Antigravity...');
            // For now, we simulate the execution
            // In production, this would call the Antigravity CLI
            // The Antigravity CLI command would be something like:
            // antigravity --model <model-id> --prompt <prompt>
            // Simulated execution for development
            const simulatedOutput = `
[Workflow Kit] Simulated execution with model: ${model.displayName}
[Workflow Kit] This is a placeholder - actual Antigravity CLI integration needed
[Workflow Kit] Current task from fix_plan: ${this.getCurrentTask()}
[Workflow Kit] Prompt length: ${prompt.length} characters
      `.trim();
            fs.writeFileSync(outputFile, simulatedOutput);
            // In production, this would be:
            // const child = spawn('antigravity', ['--model', model.id, '--prompt', prompt]);
            // or interact with Antigravity's API/CLI
            log('INFO', `Output saved to: ${outputFile}`);
            resolve({
                output: simulatedOutput,
                success: true
            });
        });
    }
    async runLoop() {
        this.running = true;
        log('SUCCESS', '🚀 Autopilot loop starting');
        log('INFO', `Project directory: ${this.projectDir}`);
        log('INFO', `Max loops: ${this.config.maxLoops}`);
        // Check if this is a valid Workflow Kit project
        const promptPath = path.join(this.projectDir, this.config.promptFile);
        if (!fs.existsSync(promptPath)) {
            log('ERROR', `Prompt file not found: ${this.config.promptFile}`);
            log('INFO', 'Run "workflow-kit-setup <project-name>" to create a new project');
            return;
        }
        while (this.running && this.loopCount < this.config.maxLoops) {
            this.loopCount++;
            log('LOOP', `=== Starting Loop #${this.loopCount} ===`);
            // Check exit conditions
            const exitReason = this.exitDetector.shouldExit(this.loopCount, this.projectDir);
            if (exitReason) {
                log('SUCCESS', `🏁 Graceful exit: ${exitReason}`);
                this.updateStatus({
                    status: 'completed',
                    exitReason,
                    lastAction: 'graceful_exit'
                });
                break;
            }
            // Get current task
            const currentTask = this.getCurrentTask();
            log('INFO', `Current task: ${currentTask}`);
            // Get unavailable models (rate limited)
            const unavailableModels = this.rateLimiter.getUnavailableModels();
            if (unavailableModels.length > 0) {
                log('WARN', `Rate-limited models: ${unavailableModels.join(', ')}`);
            }
            // Select optimal model for the task
            const { model, taskType } = (0, model_selector_1.selectModelForTask)(currentTask, unavailableModels);
            if (!model) {
                log('ERROR', 'No available models! All models are rate-limited.');
                log('INFO', 'Waiting for rate limit reset...');
                // Wait and retry
                await this.sleep(60000); // Wait 1 minute
                continue;
            }
            log('MODEL', `Selected: ${model.displayName} (task type: ${taskType})`);
            this.updateStatus({
                currentModel: model.displayName,
                lastAction: `executing_${taskType}`,
                status: 'running'
            });
            // Read prompt
            const prompt = this.readPrompt();
            // Execute with selected model
            const { output, success } = await this.executeAntigravity(model, prompt);
            // Record the call for rate limiting
            this.rateLimiter.recordCall(model.id);
            // Analyze output for exit signals
            this.exitDetector.analyzeOutput(this.loopCount, output, success);
            if (success) {
                log('SUCCESS', '✅ Loop completed successfully');
                this.updateStatus({
                    lastAction: 'completed',
                    status: 'running'
                });
            }
            else {
                log('ERROR', '❌ Loop failed');
                this.updateStatus({
                    lastAction: 'failed',
                    status: 'error'
                });
            }
            // Pause between loops
            log('INFO', `Pausing ${this.config.pauseBetweenLoops / 1000}s before next loop...`);
            await this.sleep(this.config.pauseBetweenLoops);
        }
        log('SUCCESS', '🎉 Autopilot loop finished');
        log('INFO', `Total loops: ${this.loopCount}`);
        log('INFO', `Total API calls: ${this.rateLimiter.getGlobalCalls()}`);
    }
    stop() {
        log('WARN', 'Stopping Autopilot loop...');
        this.running = false;
        this.updateStatus({
            status: 'paused',
            lastAction: 'stopped'
        });
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getStats() {
        return {
            loopCount: this.loopCount,
            rateLimitStats: this.rateLimiter.getStats(),
            exitSignals: this.exitDetector.getSignals()
        };
    }
}
exports.AutopilotLoop = AutopilotLoop;
