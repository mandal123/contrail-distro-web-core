#
# Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
#

REPORTER = dot
THIRDPARTYDIR =../third-party

package:
	mkdir -p node_modules
	cp -r -p $(THIRDPARTYDIR)/node_modules/dev_requires/* node_modules/
	cp -r -p $(THIRDPARTYDIR)/node_modules/install_requires/* node_modules/
	./dev-install.sh
	./generate-files.sh

dev-install:
	make package

check: test

test: test-integration

test-integration:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--reporter $(REPORTER) \
		tests/integration/*.js

test-unit:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--reporter $(REPORTER) \
		tests/unit/*.js

clean:
	rm -f src/serverroot/jobs/core/jobsCb.api.js
	rm -f src/serverroot/web/core/feature.list.js
	rm -f src/serverroot/web/routes/url.routes.js
	rm -rf node_modules
	rm -rf webroot/config/ipam
	rm -rf webroot/config/virtualnetwork
	rm -f webroot/js/config_global.js
	rm -rf webroot/config/servicechaining
	rm -rf webroot/config/packetcapture
	rm -rf webroot/config/virtualdns
	rm -rf webroot/assets

.PHONY: dev-install test test-integration test-unit
