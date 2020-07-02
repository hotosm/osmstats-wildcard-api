//TODO:
//  - API Key / Authorization
//  -

const cf = require('@mapbox/cloudfriend');

const Parameters = {
    Certificate: {
        Type: 'String',
        Description: 'ARN of the SSL certificate'
    },
    DomainName: {
        Type: 'String',
        Description: 'E.g. osmstats-api.hotosm.org'
    }
};

const Conditions = {

};

const Resources = {
    LambdaServiceRole: {
        Type: "AWS::IAM::Role",
        Properties: {
            RoleName: cf.join("-", [cf.stackName, "LambdaServiceRole"]),
            AssumeRolePolicyDocument: {
                Version: "2012-10-17",
                Statement: [{
                    Sid: "",
                    Effect: "Allow",
                    Principal: {
                        Service: "lambda.amazonaws.com"
                    },
                    Action: "sts:AssumeRole"
                }]
            },
            ManagedPolicyArns: ["arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"],
            // Policies: [{
            //     PolicyName: "LambdaServiceRolePolicy",
            //     PolicyDocument: {
            //         Version: "2012-10-17",
            //         Statement: [{
            //             Action: ["s3:GetBucket*","s3:GetObject*","s3:List*", "s3:Put*"],
            //             Resource: [cf.join("", ["arn:aws:s3:::", cf.ref("BucketName"), "/*"]),cf.join("", ["arn:aws:s3:::", cf.ref("BucketName")])],
            //             Effect: "Allow"
            //         }]
            //     }
            // }]
        }  //probably doesn't need editing rn
    },

    APIGetFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
            FunctionName: cf.join("-", [cf.stackName, "fetch-stats"]),
            Description: "Function to fetch the osm-stats group summary endpoint and return aggregated data",
            Code: {
                "ZipFile": cf.join("\n", [
                    "exports.handler = (event, context, callback) => {",
                    "var http = require('http');",
                    "var result = {'road_count_add': 0, 'road_count_mod': 0, 'building_count_add': 0, 'building_count_mod': 0, 'waterway_count_add':0, 'poi_count_add': 0, 'poi_count_mod': 0, 'road_km_add': 0, 'road_km_mod': 0, 'waterway_km_add': 0, 'waterway_km_mod': 0, 'edits': 0, 'users': 0};",
                    "http.get(`http://osm-stats-production-api.azurewebsites.net/group-summaries/${event.queryStringParameters.key}`,",
                      "(res) => {",
                        "var data = '';",
                        "res.on('data', (chunk) => data += chunk);",
                        "res.on('end', () => {",
                          "var apiData = JSON.parse(data);",
                          "var hashtags = Object.keys(apiData);",
                          "var keys = Object.keys(result);",
                          "hashtags.map(tag => keys.map(key => result[key] += apiData[tag][key]));",
                          "callback(null, {statusCode: res.statusCode, body: JSON.stringify(result)});",
                        "});",
                      "}",
                    ");",
                    "};"
                ])
            },
            Handler: "index.handler",
            Runtime: "nodejs12.x",
            MemorySize: 1024,
            Role: cf.getAtt("LambdaServiceRole", "Arn"),
            Timeout : 60
        }
    },

    RestAPI: {
        Type: "AWS::ApiGateway::RestApi",
        Properties: {
            Description: "API to get fetch osm-stats and return aggregated data.",
            Name: cf.sub("OSM Stats Wildcard API (${AWS::StackName})"),
            EndpointConfiguration: {"Types" : ["REGIONAL"]},
        }
    },

    ApiGatewayResourceGetImage: {
        Type: "AWS::ApiGateway::Resource",
        Properties: {
            ParentId: cf.getAtt("RestAPI", "RootResourceId"),
            PathPart: 'wildcard',
            RestApiId: cf.ref("RestAPI")
        }
    },

    GetApiMethod: {
        Type: "AWS::ApiGateway::Method",
        Properties: {
            ApiKeyRequired: false,
            AuthorizationType: "NONE",
            HttpMethod: "GET",
            Integration: {
                ConnectionType: "INTERNET",
                IntegrationHttpMethod: "POST",
                TimeoutInMillis: 29000,
                Type: "AWS_PROXY",                                              //TODO the Uri properly
                Uri: cf.sub('arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${APIGetFunction.Arn}/invocations')
            },
            OperationName: 'GetStats',
            ResourceId: cf.ref("ApiGatewayResourceGetImage"),
            RestApiId: cf.ref("RestAPI")
        }
    },

    ApiGatewayModel: {
        Type: "AWS::ApiGateway::Model",
        Properties: {
            ContentType: 'application/json',
            RestApiId: cf.ref("RestAPI"),
            Schema: {}
        }
    },

    ApiGatewayStage: {
        Type: "AWS::ApiGateway::Stage",
        Properties: {
            DeploymentId: cf.ref("ApiGatewayDeployment"),
            Description: cf.join(" ", ["OSM Stats Wildcard API", cf.stackName]),
            RestApiId: cf.ref("RestAPI"),
            StageName: cf.stackName,
            CacheClusterEnabled: true,
            CacheClusterSize: '0.5'
        }
    },

    ApiGatewayDeployment: {
        Type: "AWS::ApiGateway::Deployment",
        DependsOn: ["GetApiMethod"],
        Properties: {
            Description: "OSM Stats Wildcard API",
            RestApiId: cf.ref("RestAPI"),
            "StageName": "DummyStage"
        }
    },

    ApiGatewayKey: {
        Type: "AWS::ApiGateway::ApiKey",
        Properties: {
            Description: "Key for OSM Stats Wildcard API",
            Enabled: true,
        }
    },

    ApiGatewayUsagePlan: {
        Type: "AWS::ApiGateway::UsagePlan",
        Properties: {
            ApiStages: [{
                ApiId: cf.ref("RestAPI"),
                Stage: cf.ref("ApiGatewayStage"),
            }],
            Description: "OSM Stats Wildcard API Usage Plan",
            Throttle: {
                RateLimit: 100,
                BurstLimit: 25
            },
            Quota: {
                Limit: 500,
                Period: "MONTH"
            },
            UsagePlanName: cf.stackName
        }
    },
    ApiGatewayUsagePlanApiKeys: {
        Type: "AWS::ApiGateway::UsagePlanKey",
        Properties: {
            KeyId: cf.ref("ApiGatewayKey"),
            KeyType: "API_KEY",
            UsagePlanId: cf.ref("ApiGatewayUsagePlan")
        }
    },
    ApiGatewayDomain: {
        Type: "AWS::ApiGateway::DomainName",
        Properties: {
            CertificateArn: cf.arn('acm', cf.ref("Certificate")),
            DomainName: cf.ref("DomainName")
        }
    },
    ApiGatewayMapping: {
        Type: "AWS::ApiGateway::BasePathMapping",
        Properties: {
            DomainName: cf.ref("ApiGatewayDomain"),
            Stage: cf.ref("ApiGatewayStage"),
            BasePath: "\'\'",
            RestApiId: cf.ref("RestAPI")
        }
    },
    LambdaPermissionsGet: {
        Type: "AWS::Lambda::Permission",
        Properties: {
            Action: "lambda:InvokeFunction",
            FunctionName: cf.ref("APIGetFunction"),
            Principal: "apigateway.amazonaws.com",
            SourceArn: cf.join("", ["arn:aws:execute-api:", cf.region, ":", cf.accountId, ":", cf.ref("RestAPI"), "/*/GET/wildcard"])
        }
    }
};

const Outputs = {

};

module.exports = { Parameters, Resources, Conditions, Outputs };
