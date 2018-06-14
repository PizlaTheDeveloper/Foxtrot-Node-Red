module.exports = function(RED) { 

    function PlcComSConfigNode(n) {
        RED.nodes.createNode(this,n);

        var net = require('net');

        this.host = n.host;
        this.port = n.port;
        this.term = decodeURI(n.termination);
        this.connected = false;
        this.connecting = false;
        this.foxtrotNodes = {};

        var node = this;

        var enableFoxtrotNode = function(foxtrotNode){
            if(node.connected){
                foxtrotNode.status({fill:"green", shape:"ring", text:"node-red:common.status.connected"});
                node.connection.write('EN:' + foxtrotNode.pubvar + node.term);
            }
        }

        this.registerFoxtrotNode = function(foxtrotNode){
            foxtrotNode.status({fill:"yellow", shape:"ring", text:"node-red:common.status.connecting"});
            node.foxtrotNodes[foxtrotNode.pubvar] = foxtrotNode;
            if(Object.keys(node.foxtrotNodes).length === 1){
                node.connect();
            } 
            enableFoxtrotNode(foxtrotNode);        
        }

        this.deregisterFoxtrotNode = function(foxtrotNode){
            delete node.foxtrotNodes[foxtrotNode.pubvar];
            if(Object.keys(node.foxtrotNodes).length === 0){
            
            }
        }

        this.connect = function(){
            
            if(!node.connected && !node.connecting){
                node.connecting = true;
                node.connection = net.createConnection(node.port, node.host);

                node.connection.on('connect', function(socket){
                    node.connecting = false;
                    node.connected = true;
                    Object.keys(node.foxtrotNodes).forEach(function(pubvar) {
                        enableFoxtrotNode(node.foxtrotNodes[pubvar]);
                    });
                });

                node.connection.on('data', function(data){
                    var responses = data.toString().split('\r\n');
                    responses = responses.filter(function(value){ return value !== ''; }); // delete empty lines
                    responses.forEach(element => {
                        var [method, params] = element.split(/:(.*)/);        
                        switch(method){
                            case 'DIFF':
                                var [pubvar, value] = params.split(',');
                                if(node.foxtrotNodes.hasOwnProperty(pubvar)){
                                    node.foxtrotNodes[pubvar].send({payload:value});
                                }
                                break;
                            case 'ERROR':
                                console.log('PlcComS: ' + element);
                                var [code, text] = params.split(/ (.*)/);
                                switch(Number(code)){
                                    case 33: // Unknown register name
                                        var pubvar = text.match(/'([^']+)'/)[1];
                                        if(pubvar){
                                            if(node.foxtrotNodes.hasOwnProperty(pubvar)){
                                                node.foxtrotNodes[pubvar].status({fill:"grey", shape:"ring", text:"invalid"});   
                                            }
                                        }
                                        break;
                                    
                                }
                                break; 
                            case 'WARNING':
                                console.log('PlcComS: ' + element);
                                [code, text] = params.split(/ (.*)/);
                                switch(Number(code)){
                                    case 250: // changed public file
                                        Object.keys(node.foxtrotNodes).forEach(function(pubvar) {                                            
                                            enableFoxtrotNode(node.foxtrotNodes[pubvar]);
                                        });
                                }
                                break;
                        }
                    });
                });

                node.connection.on('close', function(){
                    node.connecting = false;
                    node.connected = false;
                    Object.keys(node.foxtrotNodes).forEach(function(pubvar) {
                        node.foxtrotNodes[pubvar].status({fill:"red", shape:"ring", text:"node-red:common.status.disconnected"});
                    });
                    setTimeout(function(){
                        Object.keys(node.foxtrotNodes).forEach(function(pubvar) {
                            node.foxtrotNodes[pubvar].status({fill:"yellow", shape:"ring", text:"node-red:common.status.connecting"});
                            node.connect();
                        });     
                    }, 4000);
                });

                node.connection.on('error', function(error){
                    node.connecting = false;
                    node.connected = false;
                    Object.keys(node.foxtrotNodes).forEach(function(pubvar) {
                        node.foxtrotNodes[pubvar].status({fill:"blue", shape:"ring", text:"node-red:common.status.error"});
                    });
                });
            }
        }

        this.on('close', function(done){
            if(this.connected){
                this.connection.once('close', function(){
                    done();
                });
                this.connection.destroy();
            }    
            else{
                if(this.connecting) this.connection.destroy();
                done();
            }
        });        
    }
    RED.nodes.registerType("plccoms", PlcComSConfigNode);


    function FoxtrotInputNode(config) {
        RED.nodes.createNode(this,config);
        
        this.pubvar = config.pubvar;
        this.plccoms = RED.nodes.getNode(config.plccoms);

        var node = this;

        if(this.plccoms){            
            if(this.pubvar){                
                this.plccoms.registerFoxtrotNode(this);
            }
        }
        
    }
    RED.nodes.registerType("foxtrot-input", FoxtrotInputNode);


    function FoxtrotOutputNode(config) {
        RED.nodes.createNode(this,config);
        
        this.pubvar = config.pubvar;
        this.plccoms = RED.nodes.getNode(config.plccoms);

        var node = this;        
    }
    RED.nodes.registerType("foxtrot-output", FoxtrotOutputNode);


    RED.httpAdmin.get("/pubvarlist", RED.auth.needsPermission('foxtrot-input.read'), function(req,res) {

        var net = require('net')
        var connection = net.createConnection(req.query.port, req.query.host);

        var varlist = [];
        var done = function(){
            console.log(varlist.toString());
            res.json(varlist);
            connection.destroy();   
        }

        connection.on("connect", function(socket){
            connection.write('LIST:' + decodeURI(req.query.termination));
        });
        
        connection.on("error", done);

        connection.on("data", function(data) {
            var responses = data.toString().split('\r\n');
            responses = responses.filter(function(value){ return value !== ''; }); // delete empty lines
            responses.forEach(element => {
                [method, params] = element.split(/:(.*)/);         
                switch(method){  
                    case 'LIST':
                        var v = params.split(',')[0];
                        if(v === '') done();
                        else if(varlist.indexOf(v) < 0) varlist.push(v);
                        break;  
                }
            });
        });   
    }); 
}