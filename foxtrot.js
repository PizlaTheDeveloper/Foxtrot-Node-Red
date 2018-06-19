module.exports = function(RED) { 

    function PlcComSConfigNode(n) {
        RED.nodes.createNode(this,n);

        var net = require('net');

        this.host = n.host;
        this.port = n.port;
        this.term = decodeURI(n.termination);
        this.connected = false;
        this.connecting = false;
        this.closing = false;
        this.foxtrotNodes = {};

        var node = this;


        this.registerFoxtrotNode = function(foxtrotNode){
            RED.log.debug("Registering foxtrot node");
            foxtrotNode.status({fill:"yellow", shape:"ring", text:"node-red:common.status.connecting"});
            node.foxtrotNodes[foxtrotNode.pubvar.name] = foxtrotNode;
            if(Object.keys(node.foxtrotNodes).length === 1){
                node.connect();
            }   
            if(node.connected){
                foxtrotNode.status({fill:"green", shape:"ring", text:"node-red:common.status.connected"});    
                node.connection.write('GET:' + foxtrotNode.pubvar.name + node.term);
                if(foxtrotNode.type === 'foxtrot-input'){
                    node.connection.write('EN:' + foxtrotNode.pubvar.name + node.term);
                }
            }  
        }

        this.deregisterFoxtrotNode = function(foxtrotNode, done){
            delete node.foxtrotNodes[foxtrotNode.pubvar.name];
            if(node.closing){
                return done();
            }
            if(Object.keys(node.foxtrotNodes).length === 0){
                if(node.connected){
                    this.connection.once('close', function(){
                        done();
                    });
                    this.connection.destroy();    
                }
                else{
                    this.connection.destroy();  
                    done();    
                }
            }
            else{ 
                if(node.connected){
                    foxtrotNode.status({fill:"red", shape:"ring", text:"node-red:common.status.disconnected"});
                    if(foxtrotNode.type === 'foxtrot-input'){
                        node.connection.write('DI:' + foxtrotNode.pubvar.name + node.term);
                    }
                }
                done();
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
                        var foxtrotNode = node.foxtrotNodes[pubvar];
                        foxtrotNode.status({fill:"green", shape:"ring", text:"node-red:common.status.connected"});    
                        node.connection.write('GET:' + foxtrotNode.pubvar.name + node.term);
                        if(foxtrotNode.type === 'foxtrot-input'){
                            node.connection.write('EN:' + foxtrotNode.pubvar.name + node.term);
                        }
                    });
                });

                node.connection.on('data', function(data){
                    var responses = data.toString().split('\r\n');
                    responses = responses.filter(function(value){ return value !== ''; }); // delete empty lines
                    responses.forEach(element => {
                        RED.log.debug('PlcComS: ' + element);
                        var [method, params] = element.split(/:(.*)/);        
                        switch(method){
                            case 'DIFF':
                            case 'GET':
                                var [pubvar, value] = params.split(',');
                                if(node.foxtrotNodes.hasOwnProperty(pubvar)){
                                    var foxtrotNode = node.foxtrotNodes[pubvar];
                                    foxtrotNode.status({fill:"green", shape:"ring", text:"active"});
                                    if(foxtrotNode.type === 'foxtrot-input'){  
                                        foxtrotNode.send({topic: foxtrotNode.topic, payload:value});
                                    }
                                }
                                break;                     
                                
                            case 'ERROR':                                
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
                                [code, text] = params.split(/ (.*)/);
                                switch(Number(code)){
                                    case 250: // changed public file
                                        Object.keys(node.foxtrotNodes).forEach(function(pubvar) {                                            
                                            var foxtrotNode = node.foxtrotNodes[pubvar];
                                            node.connection.write('GET:' + foxtrotNode.pubvar.name + node.term);
                                            if(foxtrotNode.type === 'foxtrot-input'){                                                
                                                node.connection.write('EN:' + foxtrotNode.pubvar.name + node.term);
                                            }
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
                    if(!node.closing){
                        setTimeout(function(){
                            Object.keys(node.foxtrotNodes).forEach(function(pubvar) {
                                node.foxtrotNodes[pubvar].status({fill:"yellow", shape:"ring", text:"node-red:common.status.connecting"});                            
                            });    
                            node.connect(); 
                        }, 4000);
                    }
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
            node.closing = true;
            if(node.connected){
                node.connection.once('close', function(){
                    done();
                });
                node.connection.destroy();
            }    
            else{
                if(node.connecting) node.connection.destroy();
                done();
            }
        });        
    }
    RED.nodes.registerType("plccoms", PlcComSConfigNode);


    function FoxtrotInputNode(config) {
        RED.nodes.createNode(this,config);
        
        this.pubvar = config.pubvar? JSON.parse(config.pubvar) : {};
        this.plccoms = RED.nodes.getNode(config.plccoms);
        this.topic = config.topic || this.pubvar.name || "";

        var node = this;

        if(this.plccoms){            
            if(this.pubvar.name){                
                this.plccoms.registerFoxtrotNode(this);
            }            
        }

        this.on('close', function(done) {
            if(node.plccoms) {
                if(this.pubvar.name){ 
                    node.plccoms.deregister(node, done);
                }
            }
        });        
    }
    RED.nodes.registerType("foxtrot-input", FoxtrotInputNode);


    function FoxtrotOutputNode(config) {
        RED.nodes.createNode(this,config);
        
        this.pubvar = config.pubvar? JSON.parse(config.pubvar) : {};
        this.plccoms = RED.nodes.getNode(config.plccoms);

        var node = this;

        if(this.plccoms){            
            if(this.pubvar.name){                
                this.plccoms.registerFoxtrotNode(this);
            }            
        }

        this.on('close', function(done) {
            if(node.plccoms) {
                if(this.pubvar.name){     
                    node.plccoms.deregister(node, done);
                }
            }
        });
    }
    RED.nodes.registerType("foxtrot-output", FoxtrotOutputNode);


    RED.httpAdmin.get("/pubvarlist", RED.auth.needsPermission('foxtrot-input.read'), function(req,res) {

        var net = require('net')
        var connection = net.createConnection(req.query.port, req.query.host);

        var varlist = [];
        var done = function(){
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
                        var [name, type] = params.split(/,([^\*|^\~]*)/);
                        if(name === '') done();
                        else /*if(varlist.indexOf(v) < 0)*/ varlist.push({name:name,type:type});
                        break;  
                }
            });
        });   
    }); 
}