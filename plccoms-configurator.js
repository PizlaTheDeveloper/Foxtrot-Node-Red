module.exports = function(RED) {
    function PlcComSConfiguratorNode(n) {
        RED.nodes.createNode(this,n);

        var net = require('net');

        this.host = n.host;
        this.port = n.port;
        this.connected = false;
        this.connecting = false;
        this.foxtrotNodes = {};

        var node = this;

        var enableVar = function(pubvar){
            if(node.connected){
                node.connection.write('EN:' + pubvar + '\r\n');
            }
        }

        this.registerFoxtrotNode = function(foxtrotNode){
            node.foxtrotNodes[foxtrotNode.pubvar] = foxtrotNode;
            if(Object.keys(node.foxtrotNodes).length === 1){
                node.connect();
            } 
            enableVar(foxtrotNode.pubvar);        
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
                        node.foxtrotNodes[pubvar].status({fill:"green", shape:"ring", text:"node-red:common.status.connected"});
                        enableVar(pubvar);
                    });
                });

                node.connection.on('data', function(data){
                    var responses = data.toString().split('\r\n');
                    responses = responses.filter(function(value){ return value !== ''; }); // delete empty lines
                    responses.forEach(element => {
                        var method = element.split(':', 2);        
                        switch(method[0]){
                            case 'DIFF':
                                var varVal = method[1].split(',');
                                if(node.foxtrotNodes.hasOwnProperty(varVal[0])){
                                    node.foxtrotNodes[varVal[0]].send({payload:varVal[1]});
                                }
                                break;
                            case 'ERROR':

                                break; 
                        }
                    });
                });

                node.connection.on('error', function(error){
                    node.connecting = false;
                    node.connected = false;
                    Object.keys(node.foxtrotNodes).forEach(function(pubvar) {
                        node.foxtrotNodes[pubvar].status({fill:"green", shape:"ring", text:"node-red:common.status.error"});
                    });
                });
            }
        }
        
    }
    RED.nodes.registerType("plccoms-configurator", PlcComSConfiguratorNode);

      
}