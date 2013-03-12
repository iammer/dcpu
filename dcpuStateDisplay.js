var DCPUStateDisplay=new Class({
	init: function(div) {
		this.stateElems={ regs: {gp: []}, stack: [], mem: { addr: [], words: [] }};
		
		this.stateMsgHandler=bind(this,this.stateMsgHandlerUB);
		this.updateMemForState=bind(this,this.updateMemForStateUB);
		
		this.buildRegDisplay(div);
		this.buildStackDisplay(div);
		this.buildMemDisplay(div);
		
		this.lineBreakpoints={};
	},
	attachCPU: function(cpu) {
		this.cpu=cpu;
		cpu.on('state',this.stateMsgHandler);
		cpu.on('halt',this.stateMsgHandler);
		cpu.on('pause',this.stateMsgHandler);
		cpu.on('break',this.stateMsgHandler);
		cpu.on('step',this.stateMsgHandler);
		cpu.on('breakpoint',this.stateMsgHandler);
	},
	stateMsgHandlerUB: function(msg) {
	
		var state=msg.state?msg.state:msg;
		this.displayState(state,this.stateElems);
		
		this.lastState=state;
	
		if (msg.type!='state') this.updateEditor(msg.state);
	},
	updateEditor: function(state) {
		if (this.editor && this.debugInfo) {
			var debugLine=this.debugInfo.pc[state.regs.pc.val];
			if (typeof debugLine=='undefined') {
				//console.log(state.regs.pc.val);
				//console.log(this.debugInfo.pc);
			} else {
				this.editor.setSteppingLine(debugLine.lineNum);
			}
		}
	},
	displayState: function(state,elems,updateEditor) {
		for(var k in state) {
			if (typeof elems[k] != 'undefined') {
				if (typeof state[k]=='object') {
					this.displayState(state[k],elems[k],false);
				} else {
					elems[k].value=asHex(state[k]);
				}
			}
		}
		
		if (updateEditor) this.updateEditor();
		
	},
	attachEditor: function(editor) {
		this.editor=editor;
	},
	setLineBreakpoint: function(line) {
		if (this.debugInfo) {
			var debugLine=this.debugInfo.lines[line];
			if (debugLine) {
				var bpid=this.cpu.setRegBreakpoint('pc',debugLine.pc);
				this.lineBreakpoints[line]=bpid;
				return true;
			}
		}
		
		return false;
		
	},
	clearLineBreakpoint: function(line) {
		var bpid=this.lineBreakpoints[line];
		if (typeof bpid != 'undefined') {
			this.cpu.clearBreakpoint(bpid);
			delete this.lineBreakpoints[line];
		}
	},
	refreshLineBreakpoints: function() {
		var lines=[];
		for(var line in this.lineBreakpoints) {
			lines.push(line);
		}
		
		lines.each(bind(this,function(line) {
			this.clearLineBreakpoint(line);
			this.setLineBreakpoint(line);
		}));
	},
	buildRegDisplay: function(div) {
		var labels=['Reg.','A','B','C','X','Y','Z','I','J','SP','PC','EX','IA'];
		
		var regTable=newEle('table');
		regTable.id='regTable';
		regTable.className='stateTable';
		
		var headerRow=newEle('tr');
		labels.each(function(v) {
			var td=newEle('td',v);
			td.className='stateLabel';
			
			headerRow.appendChild(td);
		});
		
		var valRow=newEle('tr');
		var memRow=newEle('tr');
		
		valRow.appendChild(newEle('td','Val','stateLabel'));
		memRow.appendChild(newEle('td','[Val]','stateLabel'));
		
		var regs=this.stateElems.regs;
		for(var i=0;i<8;i++) {;
			var mvp=this.buildMemValPair(valRow,memRow);
			regs.gp[i]=mvp;
			
			addEvent(mvp.val,'change',this.getRegChangeHandler('gp',i));
			addEvent(mvp.mem,'change',this.getMemAtRegChangeHandler(mvp.val));
		}
		
		['sp','pc','o','ia'].each(bind(this,function(r) {
			var mvp=this.buildMemValPair(valRow,memRow);
			
			regs[r]=mvp;
			addEvent(mvp.val,'change',this.getRegChangeHandler(r,0));
			addEvent(mvp.mem,'change',this.getMemAtRegChangeHandler(mvp.val));
		}));
		
		
		regTable.appendChild(headerRow);
		regTable.appendChild(valRow);
		regTable.appendChild(memRow);
		
		div.appendChild(regTable);
	},
	buildStackDisplay: function(div) {
		var stackTable=newEle('table');
		stackTable.id='stackTable';
		stackTable.className='stateTable';
		
		var stackTr=newEle('tr');
		stackTr.className='stackRow';
		
		stackTr.appendChild(newEle('td','Stack ->','stateLabel'));
		
		for(var i=0;i<16;i++) {
			var stackTd=newEle('td');
			stackTd.className='stateVal';
			
			var input=this.newTextInput(stackTd);
			this.stateElems.stack[i]=input;
			input.disabled=true;
			
			stackTr.appendChild(stackTd);
		}
		
		stackTable.appendChild(stackTr);
		
		div.appendChild(stackTable);
	},
	buildMemDisplay: function(div) {
		var memTable=newEle('table');
		memTable.id='memTable';
		memTable.className='stateTable';
		
		for(var i=0;i<4;i++) {
			var memTr=newEle('tr');
			memTr.className='memRow';
			
			var memAddr=newEle('td');
			memAddr.className='stateLabel'
			
			var addrInput=this.newTextInput(memAddr)
			this.stateElems.mem.addr[i]=addrInput;
			
			memTr.appendChild(memAddr);
			
			for(var j=0;j<0x10;j++) {
				var memValTd=newEle('td');
				memValTd.className='stateVal';
				
				var input=this.newTextInput(memValTd);
				addEvent(input,'change',this.getMemChangeHandler(j,addrInput));
				
				this.stateElems.mem.words.push(input);
				memTr.appendChild(memValTd);
			}
			
			memTable.appendChild(memTr);
		}
		
		div.appendChild(memTable);
		
		addEvent(this.stateElems.mem.addr[0],'change',this.updateMemForState);
		for(var i=1;i<4;i++) {
			this.stateElems.mem.addr[i].disabled=true;
		}
	
	},
	buildMemValPair: function(valRow,memRow) {
		var valTd=newEle('td');
		valTd.className='stateVal';
			
		var memTd=newEle('td');
		memTd.className='stateVal';
						
		var ret={val: this.newTextInput(valTd), mem: this.newTextInput(memTd)};
		
		valRow.appendChild(valTd);
		memRow.appendChild(memTd);
		
		return ret;
	},
	newTextInput: function(parent) {
		var input=newEle('input');
		input.type='text';
		input.size=4;
		
		parent.appendChild(input);
		
		return input;
	},
	updateMemForStateUB: function() {
		this.cpu.setMemForState(parseInt(this.stateElems.mem.addr[0].value,16));
		
	},
	getRegChangeHandler: function (reg,idx) {
		return bind(this,function(e) {
			var num=parseInt(e.target.value,16);
			if (!isNaN(num)) {
				this.cpu.setReg(reg,idx,num);
			}
		});
	},
	getMemAtRegChangeHandler: function(regInput) {
		return bind(this,function(e) {
			var num=parseInt(e.target.value,16);
			if (!isNaN(num)) {
				this.cpu.setMem(parseInt(regInput.value,16),[num]);
				this.cpu.sendState();
			}
		});
	},
	getMemChangeHandler: function(offset, baseInput) {
		return bind(this,function(e) {
			var num=parseInt(e.target.value,16);
			if (!isNaN(num)) {
				this.cpu.setMem(offset + parseInt(baseInput.value,16),[num]);
				this.cpu.sendState();
			}
		});
	}
});
