.DEFAULT_GOAL := help
.PHONY: help

DOCKER_STAGE ?= development
INTERACTIVE := $(shell [ -t 0 ] && echo i || echo d)
APPDIR = /usr/hu
PWD=$(shell pwd)
PORT := $(shell [ -z ${PORT} ] && echo 8036 || echo ${PORT})
PORT_DEBUG := $(shell [ -z ${PORT_DEBUG} ] && echo 58036 || echo ${PORT_DEBUG})
PORT_CHROME := $(shell [ -z ${PORT_CHROME} ] && echo 41001 || echo ${PORT_CHROME})
CONTAINER_NAME=process-gracker
CONTAINER_NAME_LOCALE=$(CONTAINER_NAME)
DOCKER_DATE_TAG=$(shell date +%Y-%m)
NODE_DEBUG=*,-koa-router,-nodemon,-nodemon:*,-snapdragon:*,-nsqjs:*,-koa:application,-follow-redirects,-puppeteer:*
name_suffix :="1"

welcome:
	@printf "\033[33m                                         _                  _              \n"
	@printf "\033[33m _ __  _ __ ___   ___ ___  ___ ___      | |_ _ __ __ _  ___| | _____ _ __  \n"
	@printf "\033[33m| '_ \| '__/ _ \ / __/ _ \/ __/ __|_____| __| '__/ _\` |/ __| |/ / _ \ '__| \n"
	@printf "\033[33m| |_) | | | (_) | (_|  __/\__ \__ \_____| |_| | | (_| | (__|   <  __/ |    \n"
	@printf "\033[33m| .__/|_|  \___/ \___\___||___/___/      \__|_|  \__,_|\___|_|\_\___|_|    \n"
	@printf "\033[33m|_|                                                                        \n"
	@printf "\033[m\n"

setup: welcome build-docker-image build-docker-image-browser ## Install dependencies
	@echo 'Installing dependencies'
	@docker network create sequoai-dev 2> /dev/null || true
ifeq ("$(wildcard ./.env)","")
	@cp .env.default .env
endif

check-if-docker-image-exists:
ifeq ($(shell docker images -q seq/${CONTAINER_NAME}:${DOCKER_STAGE}-date-${DOCKER_DATE_TAG} 2> /dev/null | wc -l|bc),0)
	@echo "Docker image not found, building Docker image first"; sleep 2;
	@make build-docker-image
endif

check-if-docker-browser-image-exists:
ifeq ($(shell docker images -q seq/${CONTAINER_NAME}:browser-${DOCKER_STAGE}-date-${DOCKER_DATE_TAG} 2> /dev/null | wc -l|bc),0)
	@echo "Docker image not found, building Docker image first"; sleep 2;
	@make build-docker-image-browser
endif

check-if-docker-nsq-image-exists:
ifeq ($(shell docker images -q seq/nsq:latest 2> /dev/null | wc -l|bc),0)
	@echo "Docker image for nsq not found, building Docker image first"; sleep 2;
	@make build-docker-image-nsq
endif

check-if-docker-pdfxtractor-image-exists:
ifeq ($(shell docker images -q seq/pdfxtractor:latest 2> /dev/null | wc -l|bc),0)
	@echo "Docker image for pdf extractor not found, building Docker image first"; sleep 2;
	@make build-docker-image-pdfxtractor
endif

build-docker-image:
	@echo "Building docker image from Dockerfile"
	@docker build --no-cache --force-rm --target ${DOCKER_STAGE} . -t seq/${CONTAINER_NAME}:${DOCKER_STAGE}  -t seq/${CONTAINER_NAME}:${DOCKER_STAGE}-date-${DOCKER_DATE_TAG}

build-docker-image-browser:
	@echo "Building docker image from Dockerfile_browser"
	@docker build --force-rm --network sequoai-dev -f Dockerfile_browser . -t seq/${CONTAINER_NAME}:browser-${DOCKER_STAGE}  -t seq/${CONTAINER_NAME}:browser-${DOCKER_STAGE}-date-${DOCKER_DATE_TAG}

build-docker-image-nsq:
	@echo "Building docker image from Dockerfile_nsq"
	@docker build -f Dockerfile_nsq . -t seq/nsq:latest

build-docker-image-pdfxtractor:
	@echo "Building docker image from Dockerfile_pdfExtractor"
	@docker build -f Dockerfile_pdfExtractor . -t seq/pdfxtractor:latest

run-dev: welcome check-if-docker-image-exists ## Run project for development purposes with debug output.
	@echo 'Listening TCP connections on localhost:$(PORT) and ${CONTAINER_NAME}.hud'
	@docker run -t${INTERACTIVE} --network sequoai-dev --rm -v ${PWD}:${APPDIR}:delegated -p $(PORT):80 -p $(PORT_DEBUG):$(PORT_DEBUG) --env-file=.env -eDEBUG=${NODE_DEBUG} -e USER_PERM=$(shell id -u):$(shell id -g) -w ${APPDIR} --name "${CONTAINER_NAME}" seq/${CONTAINER_NAME}:${DOCKER_STAGE}

run-dev-cronjob: welcome check-if-docker-image-exists ## Run cronjob that populates a new search. If you have the env CRON_SCHEDULE defined, the process will be running and scheduled at the desired values
	@docker run -t${INTERACTIVE} --network sequoai-dev --rm -v ${PWD}:${APPDIR}:delegated --env-file=.env -eDEBUG=${NODE_DEBUG} -e USER_PERM=$(shell id -u):$(shell id -g) -w ${APPDIR} --entrypoint=./src/worker/populateQueue.js --name "cron-${CONTAINER_NAME}" seq/${CONTAINER_NAME}:${DOCKER_STAGE}

run-dev-mongodb: ## Start a local MongoDB docker instance at port 47017 #TBD
	@echo "Running local Mongo at mongodb://localhost:47017" or "mongodb://mongodb4.sequoai-dev:27017"
	@docker run -d --network sequoai-dev --rm -p 47017:27017 -v ${PWD}/.mongo-data:/data/db --name mongodb4 mongo:4.4 


run-dev-nsq:  check-if-docker-nsq-image-exists ## Start a local NSQ docker instance
	@echo "Running local NSQ at http://localhost:4151"
	@docker run -d --rm --network sequoai-dev --env-file=.env -v ${PWD}/.nsq-data:/data -p 4150:4150 -p 4151:4151 -p 4160:4160  -p 4161:4161 -p 4170:4170 -p 4171:4171 --name nsq  seq/nsq:latest

run-dev-pdfxtractor:  check-if-docker-pdfxtractor-image-exists ## Start a local NSQ docker instance
	@echo "Running local NSQ at http://localhost:42002"
	@docker run -d --rm --network sequoai-dev --env-file=.env -eLOG_LEVEL=INFO -p 42002:4200 --name pdfxtractor  seq/pdfxtractor:latest

run-dev-browser: welcome check-if-docker-browser-image-exists ## Start a chrome docker image to be used by the main 'run-dev' process
	@echo 'Listening TCP connections on localhost:$(PORT_CHROME) and browser-${CONTAINER_NAME}.hud:31001'
	@docker run -t${INTERACTIVE} --network sequoai-dev --rm -v ${PWD}:/home/chrome:delegated -m 2048m --cpus=1.5 --privileged --env-file=.env -eDEBUG=${NODE_DEBUG} -e PORT=30001 -e USER_PERM=$(shell id -u):$(shell id -g) --name "browser-${CONTAINER_NAME}${name_suffix}" seq/${CONTAINER_NAME}:browser-${DOCKER_STAGE}

help: welcome
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep ^help -v | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

