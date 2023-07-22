import { Construct } from 'constructs';
import { utils } from '@aws-quickstart/eks-blueprints';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { GrafanaOperatorSecretAddon } from './grafanaoperatorsecretaddon';
import * as amp from 'aws-cdk-lib/aws-aps';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ObservabilityBuilder } from '../common/observability-builder';

export default class SingleNewEksGravitonOpenSourceObservabilityConstruct {
    constructor(scope: Construct, id: string) {
        // AddOns for the cluster
        const stackId = `${id}-observability-accelerator`;

        const account = process.env.COA_ACCOUNT_ID! || process.env.CDK_DEFAULT_ACCOUNT!;
        const region = process.env.COA_AWS_REGION! || process.env.CDK_DEFAULT_REGION!;
        const ampWorkspaceName = process.env.COA_AMP_WORKSPACE_NAME! || 'observability-amp-Workspace';
        const ampWorkspace = blueprints.getNamedResource(ampWorkspaceName) as unknown as amp.CfnWorkspace;
        const ampEndpoint = ampWorkspace.attrPrometheusEndpoint;
        const ampWorkspaceArn = ampWorkspace.attrArn;      
        const amgEndpointUrl = process.env.COA_AMG_ENDPOINT_URL;

        // All Grafana Dashboard URLs from `cdk.json` if present
        const grafanaGitOpsConfig: blueprints.FluxCDAddOnProps = utils.valueFromContext(scope, "grafanaGitOpsConfig", undefined);
        grafanaGitOpsConfig.bootstrapValues!.AMG_AWS_REGION = region;
        grafanaGitOpsConfig.bootstrapValues!.AMP_ENDPOINT_URL = ampEndpoint;
        grafanaGitOpsConfig.bootstrapValues!.AMG_ENDPOINT_URL = amgEndpointUrl;

        Reflect.defineMetadata("ordered", true, blueprints.addons.GrafanaOperatorAddon);
        const addOns: Array<blueprints.ClusterAddOn> = [
            new blueprints.addons.KubeProxyAddOn("v1.27.1-eksbuild.1"),
            new blueprints.addons.AwsLoadBalancerControllerAddOn(),
            new blueprints.addons.CertManagerAddOn(),
            new blueprints.addons.CloudWatchLogsAddon({
                logGroupPrefix: `/aws/eks/${stackId}`,
                logRetentionDays: 30
            }),
            new blueprints.addons.AdotCollectorAddOn(),
            new blueprints.addons.AmpAddOn({
                ampPrometheusEndpoint: ampEndpoint,
                ampRules: {
                    ampWorkspaceArn: ampWorkspaceArn,
                    ruleFilePaths: [
                        __dirname + '/../common/resources/amp-config/alerting-rules.yml',
                        __dirname + '/../common/resources/amp-config/recording-rules.yml'
                    ]
                }
            }),
            new blueprints.addons.XrayAdotAddOn(),
            new blueprints.addons.ExternalsSecretsAddOn(),
            new blueprints.addons.GrafanaOperatorAddon({
                version: 'v5.0.0-rc3'
            }),
            new blueprints.addons.FluxCDAddOn(grafanaGitOpsConfig),
            new GrafanaOperatorSecretAddon(),
        ];

        const mngProps: blueprints.MngClusterProviderProps = {
            version: eks.KubernetesVersion.of("1.27"),
            instanceTypes: [new ec2.InstanceType("m7g.large")],
            amiType: eks.NodegroupAmiType.AL2_ARM_64,
        };

        ObservabilityBuilder.builder()
            .account(account)
            .region(region)
            .addNewClusterObservabilityBuilderAddOns()
            .resourceProvider(ampWorkspaceName, new blueprints.CreateAmpProvider(ampWorkspaceName, ampWorkspaceName))
            .clusterProvider(new blueprints.MngClusterProvider(mngProps))
            .addOns(...addOns)
            .build(scope, stackId);
    }
}
