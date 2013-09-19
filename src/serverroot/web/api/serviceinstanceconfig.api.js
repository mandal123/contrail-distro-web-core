/*
 * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
 */

/**
 * @serviceinstance.api.js
 *     - Handlers for Service Instance Configuration
 *     - Interfaces with config api server
 */

var rest = require('../../common/rest.api');
var async = require('async');
var logutils = require('../../utils/log.utils');
var commonUtils = require('../../utils/common.utils');
var config = require('../../../../config/config.global.js');
var messages = require('../../common/messages');
var global = require('../../common/global');
var appErrors = require('../../errors/app.errors.js');
var util = require('util');
var url = require('url');
var serviceTemplate = require('./servicetemplateconfig.api.js');
var computeApi = require('../../common/computemanager.api');
var authApi = require('../../common/auth.api');
var crypto = require('crypto');
var configApiServer = require('../../common/configServer.api');
var policyConfigApi = require('./policyconfig.api');
var jsonPath = require('JSONPath').eval;

/**
 * Bail out if called directly as "nodejs serviceinstanceconfig.api.js"
 */
if (!module.parent) {
    logutils.logger.warn(util.format(messages.warn.invalid_mod_call,
        module.filename));
    process.exit(1);
}

/**
 * @listServiceInstances
 * public function
 * 1. URL /api/tenants/config/service-instances/:id
 * 2. Gets list of service instances for a given project
 * 3. Needs project id as the id
 * 4. Calls listServiceInstancesCb that process data from config
 *    api server and sends back the http response.
 */
function listServiceInstances(request, response, appData) {
    var projectId, projectURL = '/project', template;

    if ((projectId = request.param('id'))) {
        projectURL += '/' + projectId.toString();
        template = request.param('template');
    } else {
        //TODO - Add Language independent error code and return
    }
    configApiServer.apiGet(projectURL, appData,
        function (error, data) {
            listServiceInstancesCb(error, data, response, appData, template)
        });
}

/**
 * @listServiceInstances
 * public function
 * 1. Get list of all service instances
 */
function listAllServiceInstances(response, appData) {
    var url = "/service-instances";
    configApiServer.apiGet(url, appData, function (error, jsonData) {
        if (error) {
            logutils.logger.error(error.stack);
            commonUtils.handleJSONResponse(null, response, []);
        } else {
            commonUtils.handleJSONResponse(error, response, jsonData);
        }
    });
};

/**
 * @listServiceInstancesCb
 * private function
 * 1. Callback for listServiceInstances
 * 2. Reads the response of per project SI list from config api server
 *    and sends it back to the client.
 */
function listServiceInstancesCb(error, siListData, response, appData, template) {
    var url = null;
    var dataObjArr = [];
    var i = 0, siLength = 0;
    var serviceInstances = {};

    if (error) {
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }

    serviceInstances['service_instances'] = [];

    if ('service_instances' in siListData['project']) {
        serviceInstances['service_instances'] =
            siListData['project']['service_instances'];
    }

    siLength = serviceInstances['service_instances'].length;

    if (!siLength) {
        commonUtils.handleJSONResponse(error, response, serviceInstances);
        return;
    }

    for (i = 0; i < siLength; i++) {
        var siRef = serviceInstances['service_instances'][i];
        url = siRef['href'].split(':8082')[1];
        commonUtils.createReqObj(dataObjArr, i, url, global.HTTP_REQUEST_GET,
            null, null, null, appData);
    }

    async.map(dataObjArr,
        commonUtils.getAPIServerResponse(configApiServer.apiGet, false),
        function (error, results) {
            siListAggCb(error, results, response, appData, template);
        });
}

/**
 * @siListAggCb
 * private function
 * 1. Callback for the SI gets, sends all SIs to client.
 */
function siListAggCb(error, results, response, appData, template) {
    if (error) {
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }

    if (template != null && template == 'analyzer-template') {
        filterInAnalyzerInstances(results, response, appData);
    } else {
        filterOutAnalyzerInstances(results, response, appData);
    }
}

/**
 * @filterInAnalyzerInstances
 * private function
 * 1. Filter and return Service Instances (SIs) of default 'analyzer-template' from list of all SIs
 * 2. Required a list of Service Template of 'analyzer' type to identify SIs of this type
 */
function filterInAnalyzerInstances(results, response, appData) {
    var filteredResults = [], templateRefs, j, i, k = 0,
        dynamicPolicyNames = [], siName;
    for (i = 0; i < results.length; i++) {
        templateRefs = results[i]['service-instance']['service_template_refs'];
        for (j = 0; j < templateRefs.length; j++) {
            if (templateRefs[j]['to'][1] == 'analyzer-template') {
                filteredResults[k] = results[i];
                siName = results[i]['service-instance']['fq_name'][2];
                siName = siName.trim().replace(' ', '-');
                dynamicPolicyNames[k] = 'default-analyzer-' + siName + '-policy';
                k += 1;
                break;
            }
        }
    }
    var projId = response.req.param('id');
    getVNDetailsByServiceInstances(filteredResults, appData, function(filteredResults) {
        logutils.logger.debug("VM Status Nova Query Started at:" + new Date());
        computeApi.getVMStatsByProject(projId, response.req, function(err, data) {
            logutils.logger.debug("VM Status Nova Response processed at:" + new Date());
            var results = updateVMStatConfigDataAgg(filteredResults, data);
            siFetchPolicyCb(response, appData, results, dynamicPolicyNames);
        });
    });
}

function configVMDataAggCb (configData, vmStatData)
{
    try {
        var siLen = configData['service_instances'].length;
        for (var i = 0; i < siLen; i++) {
            try {
                for (key in vmStatData[i]) {
                    configData['service_instances'][i][key] =
                        vmStatData[i][key];
                    if (configData['service_instances'][i]['service-instance']) {
                        delete
                            configData['service_instances'][i]['service-instance'];
                    }
                }
            } catch(e) {
            }
        }
    } catch(e) {
    }
    return configData['service_instances'];
}

function updateVMDetails (vmRefs, vmStats)
{
    var resultJSON = [];
    try {
        vmStats = vmStats['servers'];
        var vmCnt = vmRefs.length;
        for (var i = 0; i < vmCnt; i++) {
            var vmStatsCnt = vmStats.length;
            resultJSON[i] = {};
            resultJSON[i]['server'] = {};
            for (var j = 0; j < vmStatsCnt; j++) {
                if (vmRefs[i]['uuid'] == vmStats[j]['id']) {
                    resultJSON[i]['server'] = vmStats[j]; 
                }
            }
        }
    } catch(e) {
        logutils.logger.debug("In updateVMDetails(): JSON Parse error:" + e);
    }
    return resultJSON;
}

function getNetworkPolicyDetailsByProjList(projList, appData, callback)
{
    var prjCnt = projList.length;
    var dataObjArr = [];

    for (var i = 0, k = 0; i < prjCnt; i++) {
        try {
            var policys =
                projList[i]['project']['network_policys'];
            var policyCnt = policys.length;
        } catch(e) {
            continue;
        }
        for (var j = 0; j < policyCnt; j++) {
            try {
                var url = 
                    '/network-policy/' + policys[j]['uuid'];
                commonUtils.createReqObj(dataObjArr, k++, url,
                                         global.HTTP_REQUEST_GET, null, null,
                                         null, appData);
            } catch(e) {
                continue;
            }
        }
    }
    async.map(dataObjArr,
              commonUtils.getAPIServerResponse(configApiServer.apiGet, false),
              function(err, configData) {
        callback(err, configData);
    });
}

function updateServiceInstanceWithPolicy (serviceInstances, configData)
{
    var insertedVN = [];
    var siCnt = serviceInstances.length;
    for (var i = 0; i < siCnt; i++) {
        serviceInstances[i]['more_attr'] = {};
        try {
            var fqName =
                serviceInstances[i]['service-instance']['fq_name'].join(':');
            var policyCnt = configData.length;
        } catch(e) {
            continue;
        }
        for (var j = 0; j < policyCnt; j++) {
            try {
                var rule =
                    configData[j]['network-policy']['network_policy_entries']['policy_rule'];
                var ruleCnt = rule.length;
            } catch(e) {
                logutils.logger.debug("In updateServiceInstanceWithPolicy():" +
                                      "JSON Parse error:" + e);
                continue;
            }
            for (var k = 0; k < ruleCnt; k++) {
                try {
                    var appServ = rule[k]['action_list']['apply_service'];
                    var servCnt = appServ.length;
                } catch(e) {
                    continue;
                }
                for (var l = 0; l < servCnt; l++) {
                    if (fqName == appServ[l]) {
                        try {
                            var polRule = 
                                serviceInstances[i]['more_attr']['policy_rule'];
                            var len = polRule.length;
                        } catch(e) {
                            serviceInstances[i]['more_attr']['policy_rule']
                                = [];
                            len = 0;
                        }
                        serviceInstances[i]['more_attr']['policy_rule'][len]
                            = rule[k];
                    }
                }
            }
        }
    }
    return serviceInstances;
}

function getVNDetailsByServiceInstances (serviceInstances, appData, callback)
{
    var cnt = serviceInstances.length;
    var insertedProjList = {};
    var dataObjArr = [];

    for (var i = 0, j = 0; i < cnt; i++) {
        var serInst = serviceInstances[i]['service-instance'];
        var projUUID = serInst['parent_uuid'];
        if (null == insertedProjList[projUUID]) {
            url = '/project/' + projUUID;
            commonUtils.createReqObj(dataObjArr, j++, url, 
                                     global.HTTP_REQUEST_GET,
                                     null, null, null, appData);
            insertedProjList[projUUID] = projUUID;
        }
    }

    async.map(dataObjArr,
              commonUtils.getAPIServerResponse(configApiServer.apiGet, false),
              function(err, configData) {
        getNetworkPolicyDetailsByProjList(configData, appData, function(err, data) {
            serviceInstances = updateServiceInstanceWithPolicy(serviceInstances,
                                                               data);
            callback(serviceInstances);
        });
    });
}

function updateVMStatConfigDataAgg (configData, vmStats)
{
    var result = [];
    var vmFound = true;
    try {
        var servInstCnt = configData.length;
        for (var i = 0; i < servInstCnt; i++) {
            vmFound = true;
            try {
                var vmRefs = 
                    configData[i]['service-instance']['virtual_machine_back_refs'];
                if (null == vmRefs) {
                    vmFound = false;
                }
            } catch(e) {
                vmFound = false;
            }
            result[i] = {};
            result[i]['ConfigData'] = configData[i];
            if (false == vmFound) {
                result[i]['vmStatus'] = global.STR_VM_STATE_SPAWNING;
            } else {
                result[i]['VMDetails'] = updateVMDetails(vmRefs, vmStats);
                result[i] = updateVMStatus(result[i]);
            }
            updateVMStatusByCreateTS(result[i]);
        }
    } catch(e) {
        logutils.logger.debug("In updateVMStatConfigDataAgg(): JSON Parse " +
                              "error: " + e);
    }
    return result;
}

/**
 * @filterOutAnalyzerInstances
 * private function
 * 1. Filter out Service Instances (SIs) of a 'analyzer' type from list of all SIs
 * 2. Required a list of Service Template of 'analyzer' type to identify SIs of this type
 */
function filterOutAnalyzerInstances(results, response, appData) {
    var siObjArr = [];
    var filteredResults = [], templateRefs, serviceInstances = {},
        i, k = 0;
    for (i = 0; i < results.length; i++) {
        templateRefs = results[i]['service-instance']['service_template_refs'];
        if (templateRefs[0]['to'][1] != 'analyzer-template') {
            filteredResults[k] = results[i];
            k += 1;
        }
    }
    serviceInstances['service_instances'] = filteredResults;
    /* Now add the VM Stats per service instance */
    var projId = response.req.param('id');

    getVNDetailsByServiceInstances(filteredResults, appData, function(filteredResults) {
        logutils.logger.debug("VM Status Nova Query Started at:" + new Date());
        computeApi.getVMStatsByProject(projId, response.req, function(err, data) {
            logutils.logger.debug("VM Status Nova Response processed at:" + new
                                  Date());
            var result = updateVMStatConfigDataAgg(filteredResults, data);
            commonUtils.handleJSONResponse(null, response, result);
            return;
        });
    });
    /*
    var instCnt = filteredResults.length;
    for (var i = 0; i < instCnt; i++) {
        siObjArr[i] = {};
        siObjArr[i]['req'] = response.req;
        siObjArr[i]['appData'] = appData;
        siObjArr[i]['servInstId'] = filteredResults[i]['service-instance']['uuid'];
    }
    logutils.logger.debug("VM Status Nova Query Started at:" + new Date());
    async.map(siObjArr, getServiceInstanceDetails, function(err, data) {
        serviceInstances = configVMDataAggCb(serviceInstances, data);
        logutils.logger.debug("VM Status Nova Response processed at:" + new
                              Date());
        commonUtils.handleJSONResponse(null, response, serviceInstances);
    });
    */
}

/**
 * @siFetchPolicyCb
 * private function
 * 1. Get policy id for given list of SIs of 'analyzer' type
 * 2. Required a list of dynamic policy name for given list of SIs of 'analyzer' type
 */
function siFetchPolicyCb(response, appData, filteredResults, dynamicPolicyNames) {
    var serviceInstances = {}, policyUrl = '/network-policys';
    if (filteredResults.length > 0) {
        policyUrl += '?parent_fq_name_str=' + filteredResults[0]['ConfigData']['service-instance']['fq_name'][0] + ":" + filteredResults[0]['ConfigData']['service-instance']['fq_name'][1];
        configApiServer.apiGet(policyUrl, appData,
            function (error, data) {
                var policys, policyName, index;
                if (!error) {
                    policys = data['network-policys'];
                    for (var i = 0; i < policys.length; i++) {
                        policyName = policys[i]['fq_name'][2];
                        index = dynamicPolicyNames.indexOf(policyName);
                        if (index != -1) {
                            filteredResults[index]['ConfigData']['service-instance']['policyuuid'] = policys[i]['uuid'];
                        }
                    }
                }
                serviceInstances['service_instances'] = filteredResults;
                commonUtils.handleJSONResponse(error, response, serviceInstances);
            });
    } else {
        serviceInstances['service_instances'] = filteredResults;
        commonUtils.handleJSONResponse(null, response, serviceInstances);
    }
};

/**
 * @createServiceInstance
 * public function
 * 1. URL /api/tenants/config/service-instances - Post
 * 2. Sets Post Data and sends back the service instance config to client
 */
function createServiceInstance(request, response, appData) {
    var siCreateURL = '/service-instances',
        siPostData = request.body,
        templateName;

    if (typeof(siPostData) != 'object') {
        error = new appErrors.RESTServerError('Invalid Post Data');
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }

    if ((!('service-instance' in siPostData)) ||
        (!('fq_name' in siPostData['service-instance'])) ||
        (!(siPostData['service-instance']['fq_name'][2].length))) {
        error = new appErrors.RESTServerError('Invalid Service instance');
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }

    templateName = siPostData['service-instance']['service_template_refs'][0]['to'][1];
    configApiServer.apiPost(siCreateURL, siPostData, appData,
        function (error, data) {
            if (!error && templateName == 'analyzer-template') {
                //policyConfigApi.createDynamicPolicy(siPostData, appData);
            }
            setSIRead(error, data, response, appData);
        });
}

/**
 * @deleteServiceInstanceCb
 * private function
 * 1. Return back the response of service instance delete.
 */
function deleteServiceInstanceCb(error, siDelResp, response) {

    if (error) {
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }

    commonUtils.handleJSONResponse(error, response, siDelResp);
}

/**
 * @deleteServiceInstance
 * public function
 * 1. URL /api/tenants/config/service-instance/:id
 * 2. Deletes the service instance from config api server
 */
function deleteServiceInstance(request, response, appData) {
    var siDelURL = '/service-instance/',
        siId, analyzerPolicyId;

    if (siId = request.param('id').toString()) {
        siDelURL += siId;
    } else {
        error = new appErrors.RESTServerError('Service Instance ID is required.');
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }
    analyzerPolicyId = request.param('policyId');
    if (analyzerPolicyId != null && analyzerPolicyId != '') {
        policyConfigApi.deleteAnalyzerPolicy(analyzerPolicyId, appData, function (error) {
            if (error) {
                logutils.logger.error(error.stack);
            }
            configApiServer.apiDelete(siDelURL, appData,
                function (error, data) {
                    deleteServiceInstanceCb(error, data, response);
            });
        });
    } else {
        configApiServer.apiDelete(siDelURL, appData,
            function (error, data) {
                deleteServiceInstanceCb(error, data, response);
            });
    }
}

/**
 * @setSIRead
 * private function
 * 1. Callback for SI create / update operations
 * 2. Reads the response of SI get from config api server
 *    and sends it back to the client.
 */
function setSIRead(error, siConfig, response, appData) {
    var siGetURL = '/service-instance/';

    if (error) {
        commonUtils.handleJSONResponse(error, response, null);
        return;
    }

    siGetURL += siConfig['service-instance']['uuid'];
    configApiServer.apiGet(siGetURL, appData,
        function (error, data) {
            siSendResponse(error, data, response)
        });
}

/**
 * @siSendResponse
 * private function
 * 1. Sends back the response of service instance read to clients after set operations.
 */
function siSendResponse(error, siConfig, response) {
    if (error) {
        commonUtils.handleJSONResponse(error, response, null);
    } else {
        commonUtils.handleJSONResponse(error, response, siConfig);
    }
    return;
}

/**
 * @listServiceInstanceTemplates
 * 1. Sends back the response of service templates list to clients.
 */
function listServiceInstanceTemplates(request, response, appData) {
    serviceTemplate.listServiceTemplates(request, response, appData);
}

/**
 * @getVNCUrl
 * URL: /api/tenants/config/service-instance-vm?project_id=project_name&vm_id=vmuuid
 * Desc: Gets the browser compatable URL to launch VNC session for a given VM instance in a project/tenant.
 * 1. Get authentication token for the given project name using authApi.getTokenObj()
 * 2. Set headers 'X-Auth-Token', 'X-Auth-Project-Id' with token id and project uuid got from step 1
 * 3. Send POST request to "/v1.1/<project_uuid>/servers/<vmuuid>"
 * 4. Send POST request to "/v1.1/<project_uuid>/servers/<vmuuid>/actions" with data {"os-getVNCConsole": {"type": "novnc"}}
 * 5. Send back response
 */
function getVNCUrl(request, response, appData) {
    
    computeApi.launchVNC(request, function(err, data) {
        if (err) {
            commonUtils.handleJSONResponse(err, response, null);
        } else {
            commonUtils.handleJSONResponse(null, response, data);
        }
    });
}

function updateVMStatusByCreateTS (result)
{
    if (result['vmStatus'] != global.STR_VM_STATE_SPAWNING) {
        /* Status is properly updated */
        return;
    }
    var configData = result['ConfigData'];
    var siCreateTime = configData['service-instance']['id_perms']['created'];
    var siCreateUTCTime = commonUtils.getUTCTime(siCreateTime);
    var currentUTCTime = commonUtils.getCurrentUTCTime();
    if ((currentUTCTime - siCreateUTCTime) > global.INSTANCE_SPAWNING_TIMEOUT) {
        result['vmStatus'] = global.STR_VM_STATE_INACTIVE;
    }
    return;
}

function updateVMStatus (result)
{
    var vmCnt = null;
    var instCnt = null;
    var configData = result['ConfigData'];
    var maxInst = jsonPath(configData, "$..max_instances");
    if (maxInst > 0) {
        instCnt = maxInst[0];
    } else {
        instCnt = null;
    }

    var actCnt = 0, inactCnt = 0, spawnCnt = 0;
    try {
        if (null == instCnt) {
            vmCnt = result['VMDetails'].length;
        } else {
            vmCnt = instCnt;
        }
        for (var i = 0; i < vmCnt; i++) {
            try {
                /* VM State Details:
                    https://github.com/openstack/nova/blob/master/nova/compute/vm_states.py
                 */
                if (result['VMDetails'][i]['server']['OS-EXT-STS:vm_state'] ==
                    'active') {
                    actCnt++;
                } else if
                    (result['VMDetails'][i]['server']['OS-EXT-STS:vm_state'] ==
                     'building') {
                    spawnCnt++;
                } else {
                    inactCnt++;
                }
            } catch(e) {
                spawnCnt++;
            }
        }
        if (spawnCnt == vmCnt) {
            result['vmStatus'] = global.STR_VM_STATE_SPAWNING;
        } else if (actCnt == vmCnt) {
            result['vmStatus'] = global.STR_VM_STATE_ACTIVE;
        } else if (inactCnt == vmCnt) {
            result['vmStatus'] = global.STR_VM_STATE_INACTIVE;
        } else {
            result['vmStatus'] = global.STR_VM_STATE_PARTIALLY_ACTIVE;
        }
    } catch(e) {
    }
    return result;
}

function getServiceInstanceDetails (siObj, callback)
{
    var req = siObj['req'];
    var appData = siObj['appData'];
    var servInstId = siObj['servInstId'];
    var vmFound = true;

    var url = '/service-instance/' + servInstId;
    var err = null;

    configApiServer.apiGet(url, appData, function(err, data) {
        if (err || (null == data)) {
            err = new appErrors.RESTServerError('Invalid Service Instance' +
                                                'Id ' + servInstId);
            callback(err, null);
            return;
        }
        var result = {};
        try {
            var vmRefs = data['service-instance']['virtual_machine_back_refs'];
            if (null == vmRefs) {
                vmFound = false;
            }
        } catch(e) {
            vmFound = false;
        }
        if (false == vmFound) {
            result['ConfigData'] = data;
            result['vmStatus'] = global.STR_VM_STATE_SPAWNING;
            updateVMStatusByCreateTS(result);
            callback(null, result);
            return;
        }
        computeApi.getServiceInstanceVMStatus(req, vmRefs, function(err, result) {
            if (err) {
                logutils.logger.debug('Error in retrieving VM details for ' +
                                      ' Instance Id: ' + servInstId +
                                      ' with error:' + err);
                callback(null, data);
            } else {
                var resultJSON = {};
                resultJSON['ConfigData'] = data;
                resultJSON['VMDetails'] = result;
                /* Now update the vmStatus field */
                resultJSON = updateVMStatus(resultJSON);
                updateVMStatusByCreateTS(resultJSON);
                callback(err, resultJSON);
            }
        });
    });
}

function getServiceInstance(req, res, appData)
{
    var siObj = {};
    siObj['req'] = req;
    siObj['appData'] = appData;
    siObj['servInstId'] = req.param('id');
    getServiceInstanceDetails(siObj, function(err, data) {
        commonUtils.handleJSONResponse(err, res, data);
    });
}

exports.listServiceInstances = listServiceInstances;
exports.listAllServiceInstances = listAllServiceInstances;
exports.listServiceInstanceTemplates = listServiceInstanceTemplates;
exports.createServiceInstance = createServiceInstance;
exports.deleteServiceInstance = deleteServiceInstance;
exports.getVNCUrl = getVNCUrl;
exports.getServiceInstance = getServiceInstance;

