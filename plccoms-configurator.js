module.exports = function(RED) {
    function PlcComSConfiguratorNode(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.host = n.host;
        node.port = n.port;
        
    }
    RED.nodes.registerType("plccoms-configurator", PlcComSConfiguratorNode);

      
}