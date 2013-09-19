/*
 * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
 */

var assert = require("assert")
    , http = require('http')
    , url = require("url")
    , eventEmitter = require('events').EventEmitter
    , handler = require('../routes/handler')
    , commonUtils = require('../../utils/common.utils')
    , logutils = require('../../utils/log.utils')
    , util = require('util')
    , authApi = require('../../common/auth.api')
    , messages = require('../../common/messages')
    ;

if (!module.parent) {
    logutils.logger.warn(util.format(messages.warn.invalid_mod_call,
                                  module.filename));
    process.exit(1);
}

longPoll = module.exports;

/* Global Pending Request Queue per Worker */ 
var pendingReqQObj = {};

var readyQ = [];
longPoll.readyQ = readyQ;

var readyQEvent = new eventEmitter();

readyQEvent.on('add', function(data) {
  longPoll.triggerResponse();
});


/*
 * Maximum age of response in seconds
 */
var maxAge = 60;

/*
 * Global counter for unique ids
 */
var lastRequestId = 0;
longPoll.lastRequestId = lastRequestId;

/*
 *Ccompacts an array by removing all null values
 *
 */
longPoll.doCompact = function(arr) {
  if (!arr) return null;
  var i, data = [];
  
  for (i=0; i < arr.length; i++) {
    if (arr[i]) {
      data.push(arr[i]);
    }
  }
  return data;
}

/*
 * Returns current time in milliseconds from 1 Jan 1970, 00:00
 */
longPoll.getCurrentTimestamp = function() {
  return new Date().getTime();
}

/*
 * Checks for all pending requests and then triggers process of that pending 
 * request 
 */
longPoll.triggerResponse = function() {
  if (!longPoll.readyQ.length) {
    /* We got an event for add, but it seems no data, why? */
    assert(0);
  }
  var resCtx, event;
  curTS = longPoll.getCurrentTimestamp();

  /* Check if any response got timed out
   */
  for(var i = 0; i < longPoll.readyQ.length; i++) {
    resCtx = longPoll.readyQ[i];
    /* Timed out responses */
    if ((curTS - resCtx.timestamp) > maxAge * 1000) {
      logutils.logger.error("Response timed out");
      longPoll.readyQ[i]= null;
      continue;
    }
    var data = resCtx.data;
    if (resCtx.isJson) {
      resCtx.res.send(resCtx.statusCode, JSON.parse(data));
    } else {
      resCtx.res.send(resCtx.statusCode, data);
    }
    longPoll.readyQ[i] = null;
  }
  longPoll.readyQ = longPoll.doCompact(longPoll.readyQ);
}

/* Function: processPendingReq()
    This function is used to process pending request, 
    This function is invoked after processing the request, so here just delete
    the reqCtx
 */
longPoll.processPendingReq = function(ctx, next, callback) {
  var token = null;
  var defProjectObj = {};

  delete pendingReqQObj[ctx.id];// = null;
  /* Process the request */
  defTokenObj = authApi.getAPIServerAuthParams(ctx.req);
  var appData = {
    authObj: {
      req: ctx.req,
      defTokenObj: defTokenObj
    }
  };
  callback(ctx.req, ctx.res, appData);
}

var restrictedURL = {};
/* Function: restrictedURL
    This function is used to pass the authentication check,
 */
insertUrlToRestrictedList = function(url) {
  restrictedURL[url] = url;
}

/* Function: registerRestrictedURL
    This function is used to register restricted URL List
 */
registerRestrictedURL = function() {
  insertUrlToRestrictedList('/login');
  insertUrlToRestrictedList('/authenticate');
}

/* Function: checkLoginReq
    This function is used to check if the url is /login 
 */
checkLoginReq = function(req) {
  return ((req.url == '/login') || (req.url == '/authenticate'));
}

/* Function: routeAll
    This function is invoked on each request coming from web client.
    If the req.url is in the Allowed List, then req/res context gets stored
    in pending queue and triggers pending queue processing
 */
longPoll.routeAll = function(req, res, next) {
  var u = url.parse(req.url, true);
  if ((null == req.route) || (null == handler.checkURLInAllowedList(req))) {
      /* Not a Valid URL */
    next();
    return null;
  }

  var sessId    = req.sessionID,
    timestamp   = longPoll.getCurrentTimestamp(),
    requestId;

  longPoll.lastRequestId = parseInt(longPoll.lastRequestId) + 1;
  requestId = longPoll.lastRequestId;

  var ctx = {
    'id' : requestId,
    'sessId': sessId,
    'timestamp': timestamp,
    'state': "started",
    'req' : req,
    'res' : res,
  };
  /* Check if the session is authenticated or not */
  if (!handler.isSessionAuthenticated(req)) {
    /* Session not authenticated yet, so do not store this context in Q */
    if (!checkLoginReq(req)) {
        var ajaxCall = req.headers['x-requested-with'];
        if (ajaxCall == 'XMLHttpRequest') {
           res.setHeader('X-Redirect-Url','/login');
           res.send(307,'');
        } else {
           res.redirect('/login');
        }
      return null;
    }
  } else {
    /* Session is authenticated, now check resource access permission */
    var checkAccess = rbac.checkUserAccess(req, res);
    if (false == checkAccess) {
      /* We are yet to get authorized */
      longPoll.insertResToReadyQ(res, global.HTTP_STATUS_FORBIDDEN_STR,
                                 global.HTTP_STATUS_FORBIDDEN, 0);
      return null;
    }
  }
  pendingReqQObj[ctx.id] = ctx;
  return ctx;
}

/* Function: insertResToReadyQ
    Once the response is ready to send back to web client, 
    it is stored in readyQ, and one event is generated as 'add'
    which triggers to handler to take care upon this response.
 */
longPoll.insertResToReadyQ = function(res, data, statusCode, isJson) {
  var resCtx = {
    timeStamp : longPoll.getCurrentTimestamp(),
    res : res,
    data: data,
    statusCode : statusCode,
    isJson : isJson
  };
  
  longPoll.readyQ.push(resCtx);
  readyQEvent.emit('add', resCtx);
}

function redirectToLogoutByChannel (channel)
{
    var reqCtxObj = cacheApi.checkCachePendingQueue(channel);
    if (null == reqCtxObj) {
        return;
    }
    commonUtils.redirectToLogout(reqCtxObj['req'], reqCtxObj['res']);
}

exports.redirectToLogoutByChannel = redirectToLogoutByChannel;

