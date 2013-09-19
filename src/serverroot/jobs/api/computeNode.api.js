/*
 * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
 */

var rest = require('../../common/rest.api'),
    config = require('../../../../config/config.global.js'),
    adminapi = module.exports,
    logutils = require('../../utils/log.utils'),
    commonUtils = require('../../utils/common.utils'),
    messages = require('../../common/messages'),
    global = require('../../common/global'),
    appErrors = require('../../errors/app.errors'),
    util = require('util'),
    async = require('async'),
    qs = require('querystring'),
    adminApiHelper = require('../../common/adminapi.helper'),
    jobsApi = require('../core/jobs.api'),
    jsonPath = require('JSONPath').eval,
    bgpNode = require('./bgpNode.api');

computeNode = module.exports;

getVNByVRF = function(vrfName, vnList) {
    var vrf = null;
    var pos = -1;
    try {
        var len = vnList.length;
	    for (var i = 0; i < len; i++) {
	        vrf = vnList[i]['vrf_name'][0]['_'];
	        pos = vrf.indexOf(vrfName);
	        if (pos != -1) {
	            break;
	        } else {
	            continue;
	        }
	    }
	    if (i == len) {
	       return global.RESP_DATA_NOT_AVAILABLE;
	    }
	    /* TODO: Check how we can get instance */
	    return {'VN': vnList[i]['name'][0]['_'], 'instance': global.RESP_DATA_NOT_AVAILABLE};
    } catch (e) {
        return {'VN': global.RESP_DATA_NOT_AVAILABLE, 'instance': global.RESP_DATA_NOT_AVAILABLE};
    }
}

parseComputeNodeInterface = function(intfDetails) {
    var lastIndex = 0;
    var results = [];
    try {
        var intfListCnt = intfDetails.length;
    } catch(e) {
        return results;
    }
    for (var i = 0; i < intfListCnt; i++) {
        lastIndex = parseComputeNodeInterfaceDetails(intfDetails[i], results,
                                                     lastIndex);
    }
    return results;
}

fillFipLists = function(fipList, results, index) {
    var lastIndex = 0;
    var fipListCnt = fipList.length;

    for (var i = 0; i < fipListCnt; i++) {
        lastIndex = fillFipListPerInterface(fipList[i], results, lastIndex);
    }
}

fillFipListPerInterface = function(fipListEntry, results, lastIndex) {
    var j = 0;
    var fipCount = fipListEntry.length;

    for (var i = 0; i < fipCount; i++) {
        j = i + lastIndex;
        results[j] = {}; 
        try {
            results[j]['ip_addr'] = 
                commonUtils.getSafeDataToJSONify(fipListEntry[i]['ip_addr'][0]['_']);
        } catch(e) {
            results[j]['ip_addr'] = global.RESP_DATA_NOT_AVAILABLE;
        }   
        try {
            results[j]['vrf_name'] = 
                commonUtils.getSafeDataToJSONify(fipListEntry[i]['vrf_name'][0]['_']);
        } catch(e) {
            results[j]['vrf_name'] = global.RESP_DATA_NOT_AVAILABLE;
        }
    }
    return (j + 1);
}

parseComputeNodeInterfaceDetails = function(data, results, lastIndex) {
    var i = 0, j = 0;
    var name = null;
    var index = 0;
    var fipList;
    var fipListCount = 0;
    var intfCount = data.length;


    for (var i = 0; i < intfCount; i++) {
        if (data[i]['type'][0]['_'] != 'vport') {
            continue;
        }
        j = (index++) + lastIndex;
        results[j] = {};
        
        try {
            results[j]['name'] = 
                commonUtils.getSafeDataToJSONify(data[i]['name'][0]['_']);
        } catch(e) {
            results[j]['name'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        try {
            results[j]['label'] = 
                commonUtils.getSafeDataToJSONify(data[i]['label'][0]['_']);
        } catch(e) {
            results[j]['label'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        try {
            results[j]['status'] = 
            (commonUtils.getSafeDataToJSONify(data[i]['active'][0]['_']) == 'Active') ? 
            'Up' : 'Down';
        } catch(e) {
            results[j]['status'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        try {
            results[j]['vn_name'] = 
                commonUtils.getSafeDataToJSONify(data[i]['vn_name'][0]['_']);
        } catch(e) {
            results[j]['vn_name'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        try {
            results[j]['instance'] = 
                commonUtils.getSafeDataToJSONify(data[i]['vm_uuid'][0]['_']);
        } catch(e) {
            results[j]['instance'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        try {
            results[j]['ip_addr'] = 
                commonUtils.getSafeDataToJSONify(data[i]['ip_addr'][0]['_']);
        } catch(e) {
            results[j]['ip_addr'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        results[j]['fip_list'] = [];
        try {
            fipList = jsonPath(data[i]['fip_list'],
                               "$..FloatingIpSandeshList");
            fillFipLists(fipList, results[j]['fip_list']);
        } catch(e) {
            logutils.logger.debug("In parseComputeNodeInterfaceDetails(), JSON parse error:" +
                                   e);
        }
        j++;
    }
    return j;   
}

parseComputeNodeAcl = function(results) {
    var aclData = [];
    var aceList = [];
    var lastIndex = 0;
    try {
        var aclListCnt = results.length;
        for (var i = 0; i < aclListCnt; i++) {
            lastIndex = parsevRouterAclEntries(results[i], aclData, lastIndex);
        }
    } catch (e) {
        logutils.logger.debug("In parseComputeNodeAcl(): JSON Parse error: " + e);
    }
    return aclData;
}

parsevRouterAclEntries = function(data, aclData, lastIndex) {
    var i = 0, idx = 0;
    var aceListCount = 0;

    try {
        var count = data.length;
    } catch (e) {
        return lastIndex;
    }
    for (var i = 0; i < count; i++) {
        idx = i + lastIndex;
        aclData[idx] = {};
        try {
            aclData[idx]['uuid'] = commonUtils.getSafeDataToJSONify(data[i]['uuid'][0]['_']);
        } catch(e) {
            aclData[idx]['uuid'] = global.RESP_DATA_NOT_AVAILABLE;
        }
        aclData[idx]['aceList'] = [];
        try {
            aceList = data[i]['entries'][0]['list'][0]['AclEntrySandeshData'];
        } catch (e) {
            continue;
        }
        try {
            aceListCount = aceList.length;
        } catch(e) {
            continue;
        }
        try {
	        for (var j = 0; j < aceListCount; j++) {
	            aclData[idx]['aceList'][j] = {};
	            try {
	                aclData[idx]['aceList'][j]['ace_id'] = 
	                   commonUtils.getSafeDataToJSONify(aceList[j]['ace_id'][0]['_']);
	            } catch(e) {
	                aclData[idx]['aceList'][j]['ace_id'] = global.RESP_DATA_NOT_AVAILABLE;
	            }
                try {
                    aclData[idx]['aceList'][j]['dst'] = 
                       commonUtils.getSafeDataToJSONify(aceList[j]['dst'][0]['_']);
                } catch(e) {
                    aclData[idx]['aceList'][j]['dst'] = global.RESP_DATA_NOT_AVAILABLE;
                }
                try {
                    aclData[idx]['aceList'][j]['src'] = 
                       commonUtils.getSafeDataToJSONify(aceList[j]['src'][0]['_']);
                } catch(e) {
                    aclData[idx]['aceList'][j]['src'] = global.RESP_DATA_NOT_AVAILABLE;
                }
                try {
                    proto_l_range = aceList[j]['proto_l'][0]['list'];
                } catch(e) {
                    proto_l_range = [];
                }
                try {
                    action_l_str = aceList[j]['action_l'][0]['list'];
                } catch(e) {
                    action_l_str = [];
                }
                try {
                    dst_port_l_list = aceList[j]['dst_port_l'][0]['list'];
                } catch(e) {
                    dst_port_l_list = [];
                }
                try {
                    src_port_l_list = aceList[j]['src_port_l'][0]['list'];
                } catch(e) {
                    src_port_l_list = [];
                }
                proto_l_range_len = (proto_l_range) ? proto_l_range.length : 0;
                action_l_str_len = (action_l_str) ? action_l_str.length : 0;
                dst_port_l_list_len = (dst_port_l_list) ? dst_port_l_list.length : 0;
                src_port_l_list_len = (src_port_l_list) ? src_port_l_list.length : 0;
                aclData[idx]['aceList'][j]['rules'] = [];
                for (var k = 0; k < proto_l_range_len; k++) {
                    aclData[idx]['aceList'][j]['rules'][k] = {};
                    try {
	                    aclData[idx]['aceList'][j]['rules'][k]['proto_l'] =
	                        commonUtils.getSafeDataToJSONify(proto_l_range[k]['SandeshRange'][0]['min'][0]['_'])
	                         + " - " +
	                        commonUtils.getSafeDataToJSONify(proto_l_range[k]['SandeshRange'][0]['max'][0]['_']);
	                } catch(e) {
	                    aclData[idx]['aceList'][j]['rules'][k]['proto_l'] =
	                       global.RESP_DATA_NOT_AVAILABLE;
	                } 
	                try {
	                    aclData[idx]['aceList'][j]['rules'][k]['src_port_l'] =
	                        commonUtils.getSafeDataToJSONify(src_port_l_list[k]['SandeshRange'][0]['min'][0]['_'])
	                         + " - " +
	                        commonUtils.getSafeDataToJSONify(src_port_l_list[k]['SandeshRange'][0]['max'][0]['_']);
	                } catch(e) {
	                    aclData[idx]['aceList'][j]['rules'][k]['src_port_l'] = 
	                       global.RESP_DATA_NOT_AVAILABLE;
	                }
	                try {
	                    aclData[idx]['aceList'][j]['rules'][k]['dst_port_l'] =
	                        commonUtils.getSafeDataToJSONify(dst_port_l_list[k]['SandeshRange'][0]['min'][0]['_'])
	                         + " - " +
	                        commonUtils.getSafeDataToJSONify(dst_port_l_list[k]['SandeshRange'][0]['max'][0]['_']);
	                } catch(e) {
	                    aclData[idx]['aceList'][j]['rules'][k]['dst_port_l'] =
	                       global.RESP_DATA_NOT_AVAILABLE;
	                }
	                try {   
	                    aclData[idx]['aceList'][j]['rules'][k]['action'] =
	                        commonUtils.getSafeDataToJSONify(action_l_str[k]['ActionStr'][0]['action'][0]['_']);
	                } catch(e) {
	                    aclData[idx]['aceList'][j]['rules'][k]['action'] =
	                        global.RESP_DATA_NOT_AVAILABLE;
	                }      
                }
                try {
                    aclData[idx]['aceList'][j]['rule_type'] = 
                        commonUtils.getSafeDataToJSONify(aceList[j]['rule_type'][0]['_']);
                } catch(e) {
                    aclData[idx]['aceList'][j]['rule_type'] = global.RESP_DATA_NOT_AVAILABLE;
                }
            }
        } catch (e) {
            continue;
        }
    }
    return (idx + 1);
}

computeNode.getComputeNodeInterface = function(pubChannel, saveChannelKey, 
                                               ip, jobData, done) {
    var dataObjArr = [];

    var vRouterRestAPI = 
        commonUtils.getRestAPIServer(ip,
                                     global.SANDESH_COMPUTE_NODE_PORT);
    commonUtils.createReqObj(dataObjArr, 0, '/Snh_ItfReq?name=');
    
    async.map(dataObjArr,
              commonUtils.getServerRespByRestApi(vRouterRestAPI, true),
              function(err, data) {
        if (data) {
            redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                        global.HTTP_STATUS_RESP_OK,
                                        JSON.stringify(data),
                                        JSON.stringify(data), 0, 0, done);
        } else {
            redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                        global.HTTP_STATUS_INTERNAL_ERROR,
                                        global.STR_CACHE_RETRIEVE_ERROR,
                                        global.STR_CACHE_RETRIEVE_ERROR, 0,
                                        0, done);
        }
    });
}

getFlowCountAndSendvRouterAclResponse = function(ip, results, pubChannel, 
                                                 saveChannelKey, done) {
    var urlLists = [];
    urlLists[0] = [url];
    var aclCount = results.length;
    for (var i = 0; i < aclCount; i++) {
        /* Initialize results->flow_count */
        results[i]['flow_count'] = 0;
        urlLists[i] = 
            ip + '@' + global.SANDESH_COMPUTE_NODE_PORT + '@' +
            '/Snh_AclFlowReq?x=' + results[i]['uuid'];
    }
    async.map(urlLists, commonUtils.getDataFromSandeshByIPUrl(rest.getAPIServer, true), 
              function(err, resultsArr) {
        if (null == resultsArr) {
	        redisPub.publishDataToRedis(pubChannel, saveChannelKey, 
	                                    global.HTTP_STATUS_RESP_OK, 
	                                    JSON.stringify(results), 
	                                    JSON.stringify(results), 0, 0,
	                                    done);
            return;
        }
        for (i = 0; i < aclCount; i++) {
            try {
                results[i]['flow_count'] = 
                    resultsArr[i]['AclFlowResp']['flow_count'][0]['_'];
            } catch(e) {
                results[i]['flow_count'] = 0;
            }    
        }
        redisPub.publishDataToRedis(pubChannel, saveChannelKey, 
                                    global.HTTP_STATUS_RESP_OK, 
                                    JSON.stringify(results), 
                                    JSON.stringify(results), 0, 0,
                                    done);
            
        return;
    });
}

            
computeNode.getComputeNodeAcl = function(pubChannel, saveChannelKey, data,
                                         sData, jobData, done) {
    var results = [];
    /* Now retrieve compute node name */
    if (null == sData) {
        redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                    global.HTTP_STATUS_INTERNAL_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR, 0,
                                    0, done);
        return;
    }
    
    var ip = sData['nodeIp'];
    if (null == ip) {
    
        redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                    global.HTTP_STATUS_INTERNAL_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR, 0,
                                    0, done);
        return;
    }
    /* Now send sandesh Message */
    url = ip + '@' + global.SANDESH_COMPUTE_NODE_PORT + '@' + '/Snh_AclReq?uuid=';
    var urlLists = [];
    urlLists[0] = [url];
    async.map(urlLists, commonUtils.getDataFromSandeshByIPUrl(rest.getAPIServer, true), 
              function(err, results) {
        if (null == results) {
            redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                        global.HTTP_STATUS_INTERNAL_ERROR,
                                        global.STR_CACHE_RETRIEVE_ERROR,
                                        global.STR_CACHE_RETRIEVE_ERROR, 0,
                                        0, done);
            return;
        }
        results = jsonPath(results, "$..AclSandeshData");
        results = parseComputeNodeAcl(results);
        /* Now update the flow count from ACL Flow */
        getFlowCountAndSendvRouterAclResponse(ip, results, pubChannel, saveChannelKey, done);
    });
}

computeNode.processComputeNodeInterface = function(pubChannel, saveChannelKey, 
                                                   jobData, done) {
    /* We get the interface details from Sandesh */
    var url = jobData.taskData.url;
    var allDetails = false;
    var pos = url.indexOf('/Snh_ItfReq?name=');
    
    pos = ('/Snh_ItfReq?name=').length;
    var nodeIp = url.slice(pos);
    if ((nodeIp == null) || (nodeIp.length == 0)) {
        allDetails = true;
    }
    if (allDetails == true) {
        /* Currently UI does not send this request, so will implement 
           later when requires 
         */
        redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                    global.HTTP_STATUS_INTERNAL_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR, 0,
                                    0, done);
    } else {
        computeNode.getComputeNodeInterface(pubChannel, saveChannelKey,
                                            nodeIp, jobData, done);
    }
}

function getAclFlowByACLSandeshResponse (ip, aclSandeshResp, callback)
{
    var resultJSON = [];
    var aclData = jsonPath(aclSandeshResp, "$..AclSandeshData");
    var urlLists = [];
    var url = ip + '@' + global.SANDESH_COMPUTE_NODE_PORT + '@' +
        '/Snh_AclFlowReq?x=';

    if (aclData.length == 0) {
        callback(resultJSON);
        return;
    }
    aclData = aclData[0];
    try {
        var aclCnt = aclData.length;
    } catch(e) {
        callback(resultJSON);
        return;
    }
    for (var i = 0; i < aclCnt; i++) {
        /* Initialize results->flow_count */
        urlLists[i] = url + aclData[i]['uuid'];
    }
    async.map(urlLists, 
              commonUtils.getDataFromSandeshByIPUrl(rest.getAPIServer, true),
              function(err, result) {
        for (var i = 0; i < aclCnt; i++) {
            try {
                aclSandeshResp['AclResp']['acl_list']['list']['AclSandeshData'][i]['flow_count']
                    = result[i]['AclFlowResp']['flow_count'][0]['_'];
            } catch(e) {
            }
        }
        callback(aclSandeshResp);
    });
}

computeNode.processComputeNodeAcl = function(pubChannel, saveChannelKey, 
                                                   jobData, done) {
    /* We get the interface details from Sandesh */
    var url = jobData.taskData.url;
    var allDetails = false;
    var sData = {};
    var reqUrl = '/Snh_AclReq?uuid=';
    var pos = url.indexOf(reqUrl);
    var dataObjArr = [];

    pos = reqUrl.length;
    var nodeIp = url.slice(pos);
    if ((nodeIp == null) || (nodeIp.length == 0)) {
        allDetails = true;
    }
    if (allDetails == true) {
        /* Currently UI does not send this request, so will implement 
           later when requires 
         */
        redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                    global.HTTP_STATUS_INTERNAL_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR, 0,
                                    0, done);
        return;
    }
    var vRouterRestAPI =
        commonUtils.getRestAPIServer(nodeIp, global.SANDESH_COMPUTE_NODE_PORT);
    commonUtils.createReqObj(dataObjArr, 0, '/Snh_AclReq?uuid=');
    async.map(dataObjArr,
              commonUtils.getServerRespByRestApi(vRouterRestAPI, false),
              function(err, data) {
        /* Now get flow_count for each ACL UUID */
        getAclFlowByACLSandeshResponse(nodeIp, data[0], function(result) {
            redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                        global.HTTP_STATUS_RESP_OK,
                                        JSON.stringify(result),
                                        JSON.stringify(result), 0, 0, done);
        });
    });
}

computeNode.getvRouterList = function(pubChannel, saveChannelKey, jobData, done) {
    var obj = {
        'pubChannel': pubChannel, 
        'saveChannelKey': saveChannelKey, 
        'jobData': jobData, 
        'done': done
    };
    adminApiHelper.processVirtualRouters(null, null, global.GET_VROUTERS_LIST,
                                         obj, jobData);
}
                                            
processAclSandeshData = function(pubChannel, saveChannelKey, nodeIp, done, aclResponse) {
    var idx = 0;
    var resultJSON = [];
    var urlLists = [];
    var uuidLists = [];
    try {        
        var aclData = jsonPath(aclResponse, "$..AclSandeshData");
        var aclDataLen = aclData.length;
        for (var i = 0; i < aclDataLen; i++) {
            var aclEntryCnt = aclData[i].length;
            for (var j = 0; j < aclEntryCnt; j++) {
                urlLists[idx] = nodeIp + '@' + global.SANDESH_COMPUTE_NODE_PORT + '@' +
                    '/Snh_AclFlowReq?x=' + aclData[i][j]['uuid'][0]['_'];
                uuidLists[idx] = aclData[i][j]['uuid'][0]['_'];
                idx++;
            }
        }
        /* Now send sandesh message */
        async.map(urlLists, commonUtils.getDataFromSandeshByIPUrl(rest.getAPIServer, true),
                  function(err, results) {
            if (results == null) {
	            redisPub.publishDataToRedis(pubChannel, saveChannelKey,
	                                        global.HTTP_STATUS_INTERNAL_ERROR,
	                                        global.STR_CACHE_RETRIEVE_ERROR,
	                                        global.STR_CACHE_RETRIEVE_ERROR, 0,
	                                        0, done);
            } else {
                /* Now parse the data and send back */
                var resultJSON = adminApiHelper.processAclFlowsSandeshData(uuidLists, results); 
                redisPub.publishDataToRedis(pubChannel, saveChannelKey, 
                                    global.HTTP_STATUS_RESP_OK, 
                                    JSON.stringify(resultJSON), 
                                    JSON.stringify(resultJSON), 0, 0,
                                    done);        
            }
        });           
    } catch(e) {
        redisPub.publishDataToRedis(pubChannel, saveChannelKey, 
                                    global.HTTP_STATUS_RESP_OK, 
                                    JSON.stringify(resultJSON), 
                                    JSON.stringify(resultJSON), 0, 0,
                                    done);        
    }
}

computeNode.getComputeNodeAclFlows = function(pubChannel, saveChannelKey, nodeIp, done) {
    var urlLists = [];
    urlLists[0] = nodeIp + '@' + global.SANDESH_COMPUTE_NODE_PORT + '@' + '/Snh_AclReq?uuid=';
    async.map(urlLists, commonUtils.getDataFromSandeshByIPUrl(rest.getAPIServer, true), 
              function(err, results) {
        if (null == results) {
            redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                        global.HTTP_STATUS_INTERNAL_ERROR,
                                        global.STR_CACHE_RETRIEVE_ERROR,
                                        global.STR_CACHE_RETRIEVE_ERROR, 0,
                                        0, done);
            return;
        }
        processAclSandeshData(pubChannel, saveChannelKey, nodeIp, done, results[0]);
    });
}

computeNode.getvRouterAclFlows = function(pubChannel, saveChannelKey, jobData, done) {
    var url = jobData.taskData.url;
    var allDetails = false;
    var sData = {};
    var pos = url.indexOf('/Snh_AclReq?uuid=');
    pos = ('/Snh_AclReq?uuid=').length;
    var nodeIp = url.slice(pos);
    if ((nodeIp == null) || (nodeIp.length == 0)) {
        allDetails = true;
    }
    if (allDetails == true) {
        /* Currently UI does not send this request, so will implement 
           later when requires 
         */
        redisPub.publishDataToRedis(pubChannel, saveChannelKey,
                                    global.HTTP_STATUS_INTERNAL_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR,
                                    global.STR_CACHE_RETRIEVE_ERROR, 0,
                                    0, done);
    } else {
        computeNode.getComputeNodeAclFlows(pubChannel, saveChannelKey, nodeIp, done);   
    }
}
                                  
