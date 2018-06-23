# node-red-contrib-foxtrotnode

This module contains nodes for integration of Tecomat Foxtrot PLC devices into node-red.

The following nodes are implemented:

* foxtrot input - connects to a Tecomat Foxtrot PLC via PlcComS and reports value changes of selected variable
* foxtrot ouptut - connects to a Tecomat Foxtrot PLC via PlcComS and allows to set value of selected variable using input messages
* plccoms - configuration node for a connection to a PlcComS server

## Prerequisites
To use these nodes for controlling Tecomat Foxtrot CP-1xxx series a PlcComS server is needed to run on the same network as the PLC. For CP-2xxx series the PlcComS server is a part of the device itself, so the plccoms configuration node can be connected straight to the PLC. More information about using PlcComS server can be found here: 
https://www.tecomat.com/download/software-and-firmware/plccoms/

## Install

```
cd ~\.node-red
npm install node-red-contrib-foxtrotnode
```
