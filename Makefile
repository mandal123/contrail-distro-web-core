#
# Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
#

REPORTER = dot
WEBDIR = ../web-ui
UIDIR = $(WEBDIR)/ui
THIRDPARTYDIR =../web-ui/third-party
WEBUISERVER = webui-server
WEBUICLIENT = webui-client
WEBUITHIRDPARTY = webui-third-party

$(WEBUISERVER):
	if [ ! -d ../$(WEBUISERVER) ]; then git clone https://github.com/mandal123/webui-server.git ../$(WEBUISERVER); else cd ../$(WEBUISERVER) && touch testFile && git stash; git pull --rebase; git stash pop; rm testFile; fi

$(WEBUICLIENT):
	if [ ! -d ../$(WEBUICLIENT) ]; then git clone https://github.com/mandal123/webui-client.git; else cd ../$(WEBUICLIENT) && touch testFile && git stash; git pull --rebase; git stash pop; rm testFile; fi

$(WEBUITHIRDPARTY):
	if [ ! -d ../$(WEBUITHIRDPARTY) ]; then git clone https://github.com/mandal123/webui-third-party.git; else cd ../$(WEBUITHIRDPARTY) && touch testFile && git stash; git pull --rebase; git stash pop; rm testFile; fi

package: $(WEBUISERVER) $(WEBUICLIENT) $(WEBUITHIRDPARTY)
	mkdir -p $(UIDIR)
	mkdir -p $(THIRDPARTYDIR)
	cp -rf ../$(WEBUISERVER)/ $(UIDIR)
	cp -rf ../$(WEBUICLIENT)/ $(UIDIR)
	cp -rf ../$(WEBUITHIRDPARTY)/ $(THIRDPARTYDIR)
	cd $(UIDIR); make -f Makefile.server

all:	
	make package

dev-install:
	make package

clean:
	rm -rf ../web-ui

