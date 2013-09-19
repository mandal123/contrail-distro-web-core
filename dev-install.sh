#
# Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
#

#!/bin/sh

#Start - Copy kendoUI from third-party

rm -rf webroot/assets/kendoui
mkdir -p webroot/assets/kendoui
cp -r ../third-party/kendoui.complete.2013.1.514.commercial/js webroot/assets/kendoui/
cp -r ../third-party/kendoui.complete.2013.1.514.commercial/styles webroot/assets/kendoui/

#End - Copy KendoUI from third-party

#Start - Copy d3/vnd3 files from third-party

rm -rf webroot/assets/d3
mkdir -p webroot/assets/d3/js
cp -r ../third-party/d3/d3.js webroot/assets/d3/js/

rm -rf webroot/assets/crossfilter
mkdir -p webroot/assets/crossfilter/js
cp -r ../third-party/crossfilter/crossfilter.min.js webroot/assets/crossfilter/js/

rm -rf webroot/assets/nvd3
mkdir -p webroot/assets/nvd3/js
mkdir -p webroot/assets/nvd3/css
cp -r ../third-party/nvd3/nv.d3.js webroot/assets/nvd3/js/
cp -r ../third-party/nvd3/lib/fisheye.js webroot/assets/nvd3/js/fisheye.js
cp -r ../third-party/nvd3/src/nv.d3.css webroot/assets/nvd3/css/

#End - Copy d3/nvd3 files from third-party

#Start - Copy JQuery files from third-party

rm -rf webroot/assets/jquery
mkdir -p webroot/assets/jquery
cp -r ../third-party/jquery webroot/assets/jquery/js
cp -r ../third-party/jquery-ui-1.10.3/js/jquery-ui-1.10.3.custom.min.js webroot/assets/jquery/js/

#End - Copy JQuery files from third-party

#Start - Copy Bootstrap from third-party

rm -rf webroot/assets/bootstrap
mkdir webroot/assets/bootstrap
cp -r ../third-party/bootstrap-v2.3.2/js webroot/assets/bootstrap/js
cp -r ../third-party/bootstrap-v2.3.2/css webroot/assets/bootstrap/css

#End - Copy Bootstrap from third-party

#Start - Copy Font-Awesome from third-party

rm -rf webroot/assets/font-awesome
mkdir webroot/assets/font-awesome
cp -r ../third-party/font-awesome-v3.2.1/font webroot/assets/font-awesome/font
cp -r ../third-party/font-awesome-v3.2.1/css webroot/assets/font-awesome/css

#End - Copy Font-Awesome from third-party

#Start - Copy Font-Opensans from third-party

rm -rf webroot/assets/fonts-opensans
mkdir webroot/assets/fonts-opensans
cp -r ../third-party/fonts-opensans webroot/assets/

#End - Copy Font-Awesome from third-party

if command -v node >/dev/null 2; then {
    echo "Node already installed"
} else {
    echo "Installing NodeJS ..."
    cd ../third-party/node-v*
    ./configure
    make
    sudo make install
    echo "Installed NodeJS"
}
fi

