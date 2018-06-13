module.exports = function(RED) { 

    function FoxtrotNode(config) {
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
    RED.nodes.registerType("foxtrot", FoxtrotNode);

    RED.httpAdmin.get("/pubvarlist", RED.auth.needsPermission('foxtrot.read'), function(req,res) {

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
                [method, params] = element.split(/:(.+)/);         
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