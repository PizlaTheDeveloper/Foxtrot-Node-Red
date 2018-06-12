module.exports = function(RED) { 

    function FoxtrotNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        // this.plccoms = RED.nodes.node(config.plccoms);

        // this.plccoms.on('Connected', function (data) {            
        //     console.log('jupiiiiiii');
        // })

        // if(this.plccoms){

        // }
        // else{

        // }
    }
    RED.nodes.registerType("foxtrot", FoxtrotNode);

    RED.httpAdmin.get("/pubvarlist", RED.auth.needsPermission('foxtrot.read'), function(req,res) {

        console.log('GET /pubvarlist')

        var net = require('net')
        var connection = net.createConnection(req.query.port, req.query.host);

        connection.on("connect", function(socket){
            console.log('PlcComS successfully connected');  
            connection.write('LIST:\r\n');
        });
        
        connection.on("error", function(err) {
            console.log('PlcComS connection error');   
            res.json([]);
        });

        connection.on("data", function(data) {
            // if(data.toString().split(':',1)[0]
            var varlist = null;
            var responses = data.toString().split('\r\n');
            responses = responses.filter(function(value){ return value !== ''; }); // delete empty lines
            responses.forEach(element => {
                var method = element.split(':', 2);        
                switch(method[0]){  
                    case 'LIST':
                        if(varlist == null) varlist = [];
                        var v = method[1].split(',')[0];
                        if(v !== '' && varlist.indexOf(v) < 0) varlist.push(v);
                        break; 
                    case 'ERROR': 
                        if(varlist == null) varlist = [];    
                }
            });

            if(varlist){
                console.log('PlcComS loaded varlist: ' + varlist)
                res.json(varlist);
                connection.destroy();
            }
        });

        
        // connection.onData = function(data){
        //     var responses = data.toString().split('\r\n');
        //     responses = responses.filter(function(value){
        //         return value !== '';
        //     });
        //     responses.forEach(element => {
        //         var method = element.split(':', 2);        
        //         switch(method[0]){
        //             case 'LIST':
        //                 var v = method[1].split(',')[0];
        //                 if(v !== '' && node.varlist.indexOf(v) < 0) node.varlist.push(v);
        //                 break;
        //             default:
        //                 console.log('Foxtrot: ' + data.toString());
        //         }
        //     });
        //     console.log(node.varlist.toString());                
        // }

        // // node.connection.on("connect", node.onConnect);
        // // node.connection.on("data", node.onData);    
    }); 
}