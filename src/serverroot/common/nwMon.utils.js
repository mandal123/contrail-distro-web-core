/*
 * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
 */

/**
 *  nwMon.utils.js:
 *      This file contains utility functions for network monitoring pages
 */

var commonUtils = require('../utils/common.utils'),
    logutils = require('../utils/log.utils'),
    assert = require('assert'),
    async = require('async');


getTimeGranByTimeSlice = function(timeObj, sampleCnt) {
    var startTime = timeObj['start_time'];
    var endTime = timeObj['end_time'];
    var timeGran = (endTime - startTime) / (sampleCnt * 
        global.MILLISEC_IN_SEC * global.MICROSECS_IN_MILL);
    if (timeGran < 1) { 
        timeGran = 1; 
    }    
    return Math.floor(timeGran);
}

function createTimeObj (appData)
{
    var minsSince = appData['minsSince'];
    var minsAlign = appData['minsAlign'];

    var endTime = commonUtils.getUTCTime(new Date().getTime());
    var startTime = 0;

    if (minsSince != -1) {
        if (appData['startTime'] != null) {
            var ctDate = new Date();
            if (null != minsAlign) {
                ctDate.setSeconds(0);
            }

            startTime =
                commonUtils.getUTCTime(commonUtils.adjustDate(ctDate, 
                                                              {'min':-minsSince}).getTime());
        } else {
            startTime = parseInt(appData['startTime']);
            endTime = parseInt(appData['endTime']);
        }
    }   

    var timeObj = {}; 
    timeObj['start_time'] = startTime * 1000;
    timeObj['end_time'] = endTime * 1000;
    return timeObj;
}

getStatDataByQueryJSON = function(srcQueryJSON, destQueryJSON, callback) {
    var dataObjArr = [];
    commonUtils.createReqObj(dataObjArr, 0, global.RUN_QUERY_URL,
                             global.HTTP_REQUEST_POST,
                             commonUtils.cloneObj(srcQueryJSON));
    commonUtils.createReqObj(dataObjArr, 1, global.RUN_QUERY_URL,
                             global.HTTP_REQUEST_POST,
                             commonUtils.cloneObj(destQueryJSON));
    logutils.logger.debug("Query1 executing: " + JSON.stringify(dataObjArr[0]['data']));
    logutils.logger.debug("Query2 executing:" + JSON.stringify(dataObjArr[1]['data']));
    async.map(dataObjArr, commonUtils.getServerRespByRestApi(opServer, true),
              function(err, data) {
        callback(err, data);
    });
}

function createTimeQueryObjByStartEndTime (startTime, endTime) 
{
    var timeObj = {};
    timeObj['start_time'] = parseInt(startTime) * global.MICROSECS_IN_MILL;
    timeObj['end_time'] = parseInt(endTime) * global.MICROSECS_IN_MILL;
    return timeObj;
}

function createTimeObjByAppData (appData) 
{
    var minsSince = appData['minsSince'];
    var timeObj = null;
    if ((minsSince != null) && (null == appData['startTime'])) {
        timeObj = createTimeObj(appData);
        timeObj['timeGran'] = exports.getTimeGranByTimeSlice(timeObj, 
                                                             appData['sampleCnt']);
    } else {
        assert(appData['startTime']);
        assert(appData['endTime']);
        timeObj = createTimeQueryObjByStartEndTime(appData['startTime'],
                                                   appData['endTime']);
        if (null == appData['timeGran']) {
            timeObj['timeGran'] = exports.getTimeGranByTimeSlice(timeObj,
                                                                 appData['sampleCnt']);
        } else {
            timeObj['timeGran'] = parseInt(appData['timeGran']);
        }
    }
    return timeObj;
}

exports.getTimeGranByTimeSlice = getTimeGranByTimeSlice;
exports.getStatDataByQueryJSON = getStatDataByQueryJSON;
exports.createTimeQueryObjByStartEndTime = createTimeQueryObjByStartEndTime;
exports.createTimeObjByAppData = createTimeObjByAppData;
