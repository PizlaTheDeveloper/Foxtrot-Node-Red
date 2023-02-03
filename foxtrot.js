// Copyright (c) 2018 Jan Martinec
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

const iconv = require('iconv-lite');

module.exports = function (RED) {

    function PlcComSConfigNode(n) {

        RED.nodes.createNode(this, n);

        var net = require('net');
        var msg;

        this.host = n.host;
        this.port = n.port;
        this.term = decodeURI(n.termination);
        this.connected = false;
        this.connecting = false;
        this.closing = false;
        this.foxtrotNodes = {};

        var node = this;

        this.writeServer = function (msg) {
            RED.log.debug('PlcComS ← ' + msg);
            node.connection.write(msg + node.term);
        }

        this.registerFoxtrotNode = function (foxtrotNode) {

            RED.log.debug("Registering foxtrot node");
            foxtrotNode.status({ fill: "yellow", shape: "ring", text: "node-red:common.status.connecting" });
            node.foxtrotNodes[foxtrotNode.pubvar.name] = foxtrotNode;

            if (Object.keys(node.foxtrotNodes).length === 1) node.connect();

            if (node.connected) {
                foxtrotNode.status({ fill: "green", shape: "ring", text: "node-red:common.status.connected" });
                if (foxtrotNode.type === 'foxtrot-input') {
                    node.writeServer('EN:' + foxtrotNode.pubvar.name + ' ' + foxtrotNode.pubvar.delta);
                }
                node.writeServer('GET:' + foxtrotNode.pubvar.name);
            }
        }

        this.deregisterFoxtrotNode = function (foxtrotNode, done) {

            delete node.foxtrotNodes[foxtrotNode.pubvar.name];

            if (node.closing) return done();

            if (Object.keys(node.foxtrotNodes).length === 0) {
                if (node.connected) {
                    this.connection.once('close', function () {
                        done();
                    });
                    this.connection.destroy();
                }
                else {
                    this.connection.destroy();
                    done();
                }
            }
            else {
                if (node.connected) {
                    foxtrotNode.status({ fill: "red", shape: "ring", text: "node-red:common.status.disconnected" });
                    if (foxtrotNode.type === 'foxtrot-input') {
                        node.writeServer('DI:' + foxtrotNode.pubvar.name);
                    }
                }
                done();
            }
        }

        this.setValue = function (pubvar, val) {
            if (!node.connected) return;
            if (val === null || val === undefined) val = "";
            else {
                if (!Buffer.isBuffer(val)) {
                    if (typeof val === "object") val = JSON.stringify(val);
                    else {
                        if (typeof val !== "string") val = String(val);
                    }
                }
            }
            node.writeServer('SET:' + pubvar.name + ',' + val);
        }

        this.process_response = function (response) {
            var [method, params] = response.split(/:(.*)/);
            switch (method) {
                case 'DIFF':
                case 'GET':
                    var [pubvar, value] = params.split(',');
                    if (!node.foxtrotNodes.hasOwnProperty(pubvar)) break;

                    var foxtrotNode = node.foxtrotNodes[pubvar];
                    foxtrotNode.status({ fill: "green", shape: "ring", text: "active" });
                    if (foxtrotNode.type !== 'foxtrot-input') break;

                    if (foxtrotNode.format === 'native') {
                        switch (foxtrotNode.pubvar.type) {
                            case "BOOL":
                                value = value.toLowerCase();
                                value = (value === "true" || value === "1");
                                break;
                            default:
                                if (foxtrotNode.pubvar.type.startsWith("STRING")) {
                                    if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                                        value = value.slice(1, -1);
                                    }
                                } else {
                                    value = Number(value);
                                }

                        }
                    }
                    foxtrotNode.send({ topic: foxtrotNode.topic, payload: value });
                    break;

                case 'ERROR':
                    var [code, text] = params.split(/ (.*)/);
                    switch (Number(code)) {
                        case 33: // Unknown register name
                            var pubvar = text.match(/'([^']+)'/)[1];
                            if (!pubvar) break;
                            if (!node.foxtrotNodes.hasOwnProperty(pubvar)) break;
                            node.foxtrotNodes[pubvar].status({ fill: "grey", shape: "ring", text: "invalid" });
                            break;

                    }
                    break;

                case 'WARNING':
                    [code, text] = params.split(/ (.*)/);
                    switch (Number(code)) {
                        case 250: // changed public file
                            Object.keys(node.foxtrotNodes).forEach(function (pubvar) {
                                var foxtrotNode = node.foxtrotNodes[pubvar];
                                if (foxtrotNode.type === 'foxtrot-input') {
                                    node.writeServer('EN:' + foxtrotNode.pubvar.name + ' ' + foxtrotNode.pubvar.delta);
                                }
                                node.writeServer('GET:' + foxtrotNode.pubvar.name);
                            });
                    }
                    break;
            }
        }

        this.connect = function () {

            if (node.connected || node.connecting) return;

            node.connecting = true;
            node.connection = net.createConnection(node.port, node.host);

            node.connection.on('connect', function (socket) {
                node.connecting = false;
                node.connected = true;
                Object.keys(node.foxtrotNodes).forEach(function (pubvar) {
                    var foxtrotNode = node.foxtrotNodes[pubvar];
                    foxtrotNode.status({ fill: "green", shape: "ring", text: "node-red:common.status.connected" });
                    if (foxtrotNode.type === 'foxtrot-input') {
                        node.writeServer('EN:' + foxtrotNode.pubvar.name + ' ' + foxtrotNode.pubvar.delta);
                    }
                    node.writeServer('GET:' + foxtrotNode.pubvar.name);
                });
            });

            node.connection.on('data', function (data) {

                var stringData = iconv.decode(data, 'win1250');

                if (this.restData) {
                    stringData = this.restData + stringData;
                }

                var responses = stringData.split('\r\n');

                this.restData = responses.pop(); // would be empty if complete response was received

                responses.forEach(response => {
                    RED.log.debug('PlcComS → ' + response);
                    node.process_response(response);
                });
            });

            node.connection.on('close', function () {
                node.connecting = false;
                node.connected = false;
                Object.keys(node.foxtrotNodes).forEach(function (pubvar) {
                    node.foxtrotNodes[pubvar].status({ fill: "red", shape: "ring", text: "node-red:common.status.disconnected" });
                });
                if (!node.closing) {
                    setTimeout(function () {
                        Object.keys(node.foxtrotNodes).forEach(function (pubvar) {
                            node.foxtrotNodes[pubvar].status({ fill: "yellow", shape: "ring", text: "node-red:common.status.connecting" });
                        });
                        node.connect();
                    }, 4000);
                }
            });

            node.connection.on('error', function (error) {
                node.connecting = false;
                node.connected = false;
                Object.keys(node.foxtrotNodes).forEach(function (pubvar) {
                    node.foxtrotNodes[pubvar].status({ fill: "blue", shape: "ring", text: "node-red:common.status.error" });
                });
            });
        }

        this.on('close', function (done) {
            node.closing = true;
            if (node.connected) {
                node.connection.once('close', function () {
                    done();
                });
                node.connection.destroy();
            }
            else {
                if (node.connecting) node.connection.destroy();
                done();
            }
        });
    }
    RED.nodes.registerType("plccoms", PlcComSConfigNode);


    function FoxtrotInputNode(config) {
        RED.nodes.createNode(this, config);

        this.plccoms = RED.nodes.getNode(config.plccoms);
        this.pubvar = config.pubvar ? JSON.parse(config.pubvar) : {};
        this.pubvar.delta = config.delta || "";
        this.topic = config.topic || this.pubvar.name || "";
        this.format = config.format || "text";

        var node = this;

        if (this.plccoms && this.pubvar.name) {

            this.plccoms.registerFoxtrotNode(this);

            this.on('close', function (done) {
                node.plccoms.deregister(node, done);
            });
        }
    }
    RED.nodes.registerType("foxtrot-input", FoxtrotInputNode);


    function FoxtrotOutputNode(config) {
        RED.nodes.createNode(this, config);

        this.pubvar = config.pubvar ? JSON.parse(config.pubvar) : {};
        this.plccoms = RED.nodes.getNode(config.plccoms);

        var node = this;

        if (this.plccoms && this.pubvar.name) {

            this.plccoms.registerFoxtrotNode(this);

            this.on('input', function (msg) {
                this.plccoms.setValue(node.pubvar, msg.payload);
            });

            this.on('close', function (done) {
                node.plccoms.deregister(node, done);
            });
        }
    }
    RED.nodes.registerType("foxtrot-output", FoxtrotOutputNode);


    RED.httpAdmin.get("/pubvarlist", RED.auth.needsPermission('foxtrot-input.read'), function (req, res) {

        RED.log.debug("GET /pubvarlist");

        var net = require('net')
        var connection = net.createConnection(req.query.port, req.query.host);

        var varlist = [];
        var done = function () {
            connection.destroy();
            res.json(varlist);
        }

        connection.on("connect", function (socket) {
            var msg = 'LIST:';
            RED.log.debug('PlcComS ← ' + msg);
            connection.write(msg + decodeURI(req.query.termination));
        });

        connection.on("error", done);

        connection.on("data", function (data) {

            var stringData = iconv.decode(data, 'win1250');

            if (this.restData) {
                stringData = this.restData + stringData;
            }

            var responses = stringData.split('\r\n');

            this.restData = responses.pop(); // would be empty if complete response was received

            responses.forEach(response => {
                RED.log.debug('PlcComS → ' + response);
                [method, params] = response.split(/:(.*)/);
                switch (method) {
                    case 'LIST':
                        var [name, type] = params.split(/,([^\*|^\~]*)/);
                        if (name === '') done();
                        else /*if(varlist.indexOf(v) < 0)*/ varlist.push({ name: name, type: type });
                        break;
                }
            });
        });
    });
}