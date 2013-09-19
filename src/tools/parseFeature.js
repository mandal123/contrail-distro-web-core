/*
 * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
 */

/* This file uses pareseURL.xml and creates the file featureRoutes.api.js */
var fs = require('fs'),
    xml2js = require('xml2js');

var featureLists = [];

createFile = function(result) {
  var itemList = result['featureLists']['item'];
  var len = 0;
  var featureCbStr = "";
  var commentStr = "";
  var method;
  var capStr = "";
  var feature, readAccess, writeAccess;

  commentStr += "/*\n";
  commentStr += " * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.\n";
  commentStr += " */\n";
  commentStr += "\n";
  var date = new Date();
  commentStr +=  "/* This file is automatically generated from the featureList.xml at\n"
  commentStr += "   " + date;
  commentStr += "\n";
  commentStr += "   Please do not edit this file."
  commentStr += "\n"
  commentStr += " */";
  commentStr += "\n";
  commentStr += "\n";

  featureCbStr += commentStr;
  var requiresList = result['featureLists']['require'];
  var len = requiresList.length;
  for (var i = 0; i < len; i++) {
      if (i == 0) {
         if ((requiresList[i] == null) || (null == requiresList[i]['define']) ||
             (null == requiresList[i]['path'])) {
             assert(0);
         }
         featureCbStr += 'var ' + requiresList[i]['define'] + ' = require(' +
            "'" + requiresList[i]['path'] + "')\n";
         continue;
      }
      featureCbStr += '  , ' + requiresList[i]['define'] + ' = require(' +
          "'" + requiresList[i]['path'] + "')\n";
  }
  featureCbStr += "  ;\n";
  featureCbStr += "\n";
  featureCbStr += "\n";
  featureCbStr += "if (!module.parent) {";
  featureCbStr += "\n  console.log(\"Call main app through 'node app'\");";
  featureCbStr += "\n  process.exit(1);";
  featureCbStr += "\n}";
  featureCbStr += "\n";
  featureCbStr += "featureList = module.exports;";
  featureCbStr += "\n";
  featureCbStr += "\n";
  
  featureCbStr += "featureList.registerFeature = function() {\n";

  commentStr = "";
  featureCbStr += commentStr;

  len = itemList.length
  for (var i = 0; i < len; i++) {
    /* register URLs */
    feature = itemList[i]['feature'];
    readAccess = (itemList[i]['read-access'] == null) ? 'all' :
      itemList[i]['read-access'];
    writeAccess = (itemList[i]['write-access'] == null) ? 'all' :
      itemList[i]['write-access'];
    
    featureCbStr += "  rbac.addFeatureAccess(" + "'" + feature + "'" 
      + ", '" + readAccess + "', " + "'" + writeAccess + "');\n"; 
  }
  featureCbStr += "}\n\n";

  fs.writeFile(__dirname + '/../serverroot/web/core/feature.list.js', featureCbStr, function(err) {
    if (err) throw err;
  });
}

var parser = new xml2js.Parser();
parser.addListener('end', function(result) {
    /* Create new file and add this info */
    createFile(result);
    console.log("Done, creating file: " + __dirname + 
                '/../serverroot/web/core/feature.list.js');
});

fs.readFile(__dirname + '/../xml/featureList.xml', function(err, data) {
    parser.parseString(data);
});

