var DCPU=new Class({
	init: function(config,cb) {
		if (typeof config=='undefined') config={};
		
		this.worker=new Worker('dcpuWorker.js');
		
		addEvent(this.worker,'error',function(e) {console.log(e);});
		addEvent(this.worker,'message',bind(this,this.receiveMessage));
		
		
		this.callbacks={};
		this.listeners={};
		
		this.lastMsgId=0;
		
		this.on('log',function(msg) {console.log((msg.order-new Date().getTime()) + ":" + msg.order + ": " + msg.msg);});
		this.on('flushLog',function(msg) {msg.messages.each(function(m) {console.log(m.order + ": " + m.msg);})});
		
		this.hardware=[];
		
		config.throttleMode='Chrome';
		if (isFF()) {
			config.throttleMode='FF';
		}
		
		this.sendMessage('init',{config: config},cb);
	
	},
	start: function() {
		this.sendMessage('start');
	},
	pause: function(cb) {
		this.sendMessage('pause',{},cb);
	},
	step: function(cb) {
		this.sendMessage('step',{},cb);
	},
	setRegBreakpoint: function(reg,val,cb,idx) {
		var id=this.getMsgId('bp');
		var msg={action: 'set', breakOn: 'reg', reg: reg, val: val, idx: idx, id: id}
		
		if (cb) {
			this.on('break',id,cb)
		}
		
		this.sendMessage('break',msg);
		
		return id;
	},
	clearBreakpoint: function(bpid) {
		this.sendMessage('break',{action: 'rm', id: bpid});
	},
	reset: function(cb) {
		this.sendMessage('reset',{},cb);
	},
	setMemWatch: function(start,end,cb) {
		var id=this.getMsgId('mw');
		
		this.on('m',id,cb);
		
		this.sendMessage('memwatch',{action: 'set', region: {start: start, end: end}}, id);
	},
	rmMemWatch: function(id) {
		this.sendMessage('memwatch',{action: 'rm'},id);
	},
	setMem: function(offset,words) {
		this.sendMessage('setmem',{offset: offset, words: words});
	},
	getMem: function(start,end,cb) {
		this.sendMessage('getmem',{start: start, end: end},cb);
	},
	setReg: function(reg,idx,val) {
		this.sendMessage('setreg',{reg: reg, idx: idx, value: val});
		this.sendState();
	},
	getRegs: function(cb) {
		this.sendMessage('getregs',{},cb);
	},
	sendState: function(cb) {
		this.sendMessage('state',{},cb);
	},
	getDump: function(cb) {
		this.sendMessage('dump',{},cb);
	},
	setDebugMode: function(enabled) {
		this.sendMessage('debug',{state: enabled});
	},
	setMemForState: function(addr) {
		this.sendMessage('memforstate',{addr: addr});
	},
	getMsgId: function(prefix) {
		return prefix + (this.lastMsgId++);
	},
	interrupt: function(a) {
		this.sendMessage('interrupt',{a: a});
	},
	interruptReturn: function(cycles) {
		this.sendMessage('intret',{cycles: cycles});
	},
	addHardware: function(hw) {
		var id=this.hardware.length;
		this.hardware.push(hw.descriptor);
		this.sendMessage('hardware',{list: this.hardware});
		var cpu=this;
		this.on('hwi','hwi'+id,function(msg) {
			hw.interrupt(cpu,msg.state)
		});
	},
	keyevent: function(idx, name, key) {
		this.sendMessage('keyevent',{idx: idx, name: name, key: key});
	},
	sendMessage: function(t,m,cb) {
		if (!m) m={};
		m.type=t;
		if (cb) {
			if (isFunc(cb)) {
				var id=this.getMsgId('cb');
				this.callbacks[id]={
					func: cb,
					id: id,
					once: true
				};
				m.id=id;
			} else {
				m.id=cb;
			}
		}
		this.worker.postMessage(m);
	},
	receiveMessage: function(e) {
		var msg=e.data;
		//console.log(msg);
		//var start=new Date().getTime();
		if (e.data=="msgClear") {
			this.worker.postMessage("msgClear");
		} else {
			var lq=this.listeners[msg.type];
			
			if (lq) {
				for(var i=0;i<lq.length;i++) {
					var l=lq[i];
					if (!l.subevent || l.subevent==msg.id) {
						l.callback(msg);
					}
				}
			}
			
			if (typeof this.callbacks[msg.id]!="undefined") {
				var cb=this.callbacks[msg.id];
				cb.func(msg,msg.id);
				if (cb.once) delete this.callbacks[msg.id];
			}
		}
		//var end=new Date().getTime();
		//var diff=end-start;
		//if (diff>30) console.log('Process message: ' + (end-start) + ' : ' + start + ' : ' + end,msg);
	},
	on: function(event,subevent,callback) {
		if (isFunc(subevent)) {
			callback=subevent;
			subevent=undefined;
		}
		
		var lq=this.listeners[event];
		if (typeof lq=="undefined") {
			lq=[];
			this.listeners[event]=lq;
		}
		
		lq.push({event: event, subevent: subevent, callback: callback});
	}
});