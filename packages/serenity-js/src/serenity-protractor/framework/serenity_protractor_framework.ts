import { Config as ProtractorConfig, Runner } from 'protractor';
import { Config, serenity, Serenity } from '../..';
import { serenityBDDReporter } from '../../serenity/reporting';
import { ProtractorReport, ProtractorReporter } from '../reporting';
import { ProtractorNotifier } from '../reporting/protractor_notifier';
import { photographer } from '../stage/photographer';
import { SerenityFrameworkConfig } from './serenity_framework_config';
import { StandIns } from './stand_ins';
import { TestFrameworkAdapter } from './test_framework_adapter';
import { TestFrameworkDetector } from './test_framework_detector';

import _ = require('lodash');

// spec: https://github.com/angular/protractor/blob/master/lib/frameworks/README.md

const noop = () => undefined;

export function run(runner: Runner, specs: string[]): PromiseLike<ProtractorReport> {
    return new SerenityProtractorFramework(serenity, runner).run(specs);
}

export class SerenityProtractorFramework {

    private config: SerenityFrameworkConfig;

    private framework: TestFrameworkAdapter;
    private reporter: ProtractorReporter;
    private onComplete = noop;

    private detect = new TestFrameworkDetector();

    constructor(private serenity: Serenity, private runner: Runner) {
        const protractorConfig = runner.getConfig() as SerenityFrameworkConfig;

        this.reporter  = new ProtractorReporter(runner);
        this.framework = this.detect.frameworkFor(protractorConfig);

        this.onComplete = protractorConfig.onComplete || noop;

        serenity.configure(this.withFallback(protractorConfig).mergedWith({
            crew: [
                this.reporter,
                new StandIns(),
                new ProtractorNotifier(runner),
            ],
        }).get);
    }

    run = (specs: string[]): PromiseLike<ProtractorReport> => this.runner.runTestPreparer(this.detect.supportedCLIParams()).
        then(() => this.framework.run(specs).
            then(noop, this.analyzeTheFailure).
            then(() => this.serenity.stageManager().waitForNextCue()).
            then(() => this.waitForOtherProtractorPlugins()).
            then(() => this.reporter.finalResults()));

    private analyzeTheFailure = (issue: any) => new Promise((resolve, reject) => {
        return issue instanceof Error
            ? reject(issue)
            : resolve(issue);   // Cucumber returns "false" when the run fails and Mocha returns the number of failed tests.
                                // Both those cases are handled by Protractor based on the final test results reported by Serenity/JS,
                                // so we don't need any additional error handling here.
    })

    private waitForOtherProtractorPlugins = () => Promise.resolve(this.onComplete);

    // tslint:disable-next-line:no-string-literal that's how, by design, you access custom properties in Protractor
    private withFallback = (pc: ProtractorConfig) => new Config(pc['serenity']).withFallback({
        crew: [
            /// [default-stage-crew-members]
            serenityBDDReporter(),
            photographer(),
            /// [default-stage-crew-members]
        ],
    })
}
