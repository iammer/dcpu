var dcpuAsm={
	isMem: /\[([^\]]+)\]/,
	init: function() {
		this.specialOps.asm=this;
		
		this.tokenizer=new Tokenizer({
			types: ['singlequote','doublequote','parens','comma','label','[',']','space','num','num','+','relative','word','sym'],
			REs: ['[\'][^\']*[\']','["][^"]*["]','\\([^\\)]*\\)',',',':\\w+','\\[','\\]','\\s+','0x[a-fA-F\\d]+','-?\\d+','\\+','r{\\w+}','\\w+','.']
		});
		
	},
	assemble: function(x) {
		var lines=x.split('\n');
		var labels={};
		var words=[];
		var pc=0;
		this.debugInfo={lines: [], errors: [], pc:[]};
		
		lines.each(bind(this,function(line,ln) {
			this.ln=ln;
		
			var debugLine={};
			this.debugInfo.lines[ln]=debugLine;
			debugLine.text=line;
			debugLine.lineNum=ln;
			
			line=line.split(';')[0];
			if (line=='') return;
			
			var tokens=this.tokenizer.tokenize(line);
			var token=tokens.getNext();
			
			var label='';
			if (token.type=='label') {
				label=token.text.substr(1).toLowerCase();
				token=tokens.getNext();
				
				labels[label]=pc;
			}
			
			debugLine.label=label;
			debugLine.pc=pc;
			debugLine.operands=[];
			if (token.type!='END') {
				var instr=token.text;
				debugLine.instr=line.instr;
				this.debugInfo.pc[pc]=debugLine;
					
				if (this.specialOps[instr]) {
					var a=this.specialOps[instr](tokens,labels,debugLine);
					if (a.pc>0) words.push(a.words);
						pc+=a.pc;
				} else {
					var opCode=this.opCodes[instr];
					if (opCode) {
						var b=this.parseOp(tokens,labels,debugLine);
						if (b.opcode > 0x1f) {
							this.debugInfo.errors.push({line: ln, text: '', type: 'error', message: 'invalid value for operand b'});
						}
						var comma=tokens.getNext();
						if (comma.type!='comma') {
							this.debugInfo.errors.push({ line: ln, text: comma.text, type: 'error', message: 'expected comma'});
						} else {
							var a=this.parseOp(tokens,labels,debugLine);
							words.push(createInstr(opCode,b.opcode,a.opcode));
							if (a.pc>0) words.push(a.words);
							if (b.pc>0) words.push(b.words);
							
									
							pc+=(a.pc+b.pc+1);
						}
					} else {
						this.debugInfo.errors.push({ line: ln, text: instr, type: 'error', message: 'Unrecognized operation'});
					}
				}
				
				token=tokens.getNext();
				if (token.type!='END') {
					this.debugInfo.errors.push({line: ln, text: token.text, type: 'error', message: 'Expected end of line'});
				}
			}
		
		}));
		
		return this.flatten(words);
		
	},
	flatten: function(words,ret) {
		if (!ret) ret=[];
		
		words.each(bind(this,function(word) {
			if (isArray(word)) {
				this.flatten(word,ret);
			} else if (isFunc(word)) {
				this.flatten(word(),ret);
			} else {
				ret.push(word);
			}
		}));
		
		return ret;
	},
	opCodes: {
		set: 1, add: 2, sub: 3, mul: 4,
		mli: 5, div: 6, dvi: 7, mod: 8,
		and: 9, bor: 10, xor: 11, shr: 12,
		asr: 13, shl: 14, sti: 0xf, ifb: 16, ifc: 17,
		ife: 18, ifn: 19, ifg: 20, ifa: 21,
		ifl: 22, ifu: 23, adx: 0x1a, sbx: 0x1b,
		sti: 0x1e, std: 0x1f
	},
	specialOps: {
		jsr: getSpecialInstructionBuilder(1),
		ret:  function(tokens,labels,debugLine) {
			return { pc: 1,
				words: [createInstr(this.asm.opCodes['set'],this.asm.registers['pc'],this.asm.registers['pop'])]
			};
		},
		brk:  function(tokens,labels,debugLine) {
			return { pc: 1,
				words: [createInstr(0,2,0)]
			};
		},
		hlt: function(tokens,labels,debugLine) {
			return { pc: 1,
				words: [createInstr(0,2,0)]
			};
		},
		dat: function(tokens,labels,debugLine) {
			var words=[];
			var token=tokens.getNext();
			while (token.type!='END') {
				var words;
				if (token.type=='singlequote' || token.type=='doublequote') {
					var string=token.text.substr(1,token.text.length-2);
					string.split('').each(function (c) {
						words.push(c.charCodeAt(0));
					});
				} else if (token.type=='num') {
					words.push(parseInt(token.text));
				} else {
					words.push(function(labels) {
						return [labels[token.text]];
					});
				}
				
				debugLine.operands.push(token.text);
				
				token=tokens.getNext();
				if (token.type=='comma' || token.type=='END') {
					token=tokens.getNext();
				} else {
					this.asm.debugInfo.errors.push({line: debugLine.lineNum, text: token.text, type: 'warning', message: 'expected comma or end-of-line'});
				}
			}
			
			return {pc: words.length,
				words: words
			};
		},
		push:  function(tokens,labels,debugLine) {
			var p=this.asm.parseOp(tokens,labels,debugLine);
			return { pc: p.pc + 1,
				  words: [
					createInstr(this.asm.opCodes['set'],this.asm.registers['push'],p.opcode),
					p.words
				  ]	
			};
		},
		pop:  function(tokens,labels,debugLine) {
			var p=this.asm.parseOp(tokens,labels,debugLine);
			return { pc: p.pc + 1,
				  words: [
					createInstr(this.asm.opCodes['set'],p.opcode,this.asm.registers['pop']),
					p.words
				  ]	
			};
		},
		'int': getSpecialInstructionBuilder(8),
		iag: getSpecialInstructionBuilder(9),
		ias: getSpecialInstructionBuilder(0xa),
		rfi: getSpecialInstructionBuilder(0xb),
		iaq: getSpecialInstructionBuilder(0xc),
		hwn: getSpecialInstructionBuilder(0x10),
		hwq: getSpecialInstructionBuilder(0x11),
		hwi: getSpecialInstructionBuilder(0x12)
	},
	parseValue: function(token,labels,debugLine) {
		
		if (token.type=='num') {
			return parseInt(token.text) & 0xffff;
		} else if (token.type=='doublequote' || token.type=='singlequote') {
			return token.text.charCodeAt(1);
		} else if (token.type=='parens') {
			return function() {
				with (labels) {
					var ret;
					eval('ret='+token.text);
					return [ret & 0xffff];
				}
			}
		} else {
			var label;
			var relative=false;
			
			if (token.type=='relative') {
				label=token.text.substr(2,token.text.length-3);
				relative=true;
			} else {
				label=token.text;
			}
			
			label=label.toLowerCase();
			
			if (typeof labels[label] != 'undefined') {
				return (labels[label]-(relative?debugLine.pc:0)) & 0xffff;
			} else {
				var debugInfo=this.debugInfo;
				return function() {
					if (typeof labels[label]=='undefined') {
						debugInfo.errors.push({ line: debugLine.lineNum, text: label, type: 'error', message: 'unknown label'});
					}
					return [(labels[label]-(relative?debugLine.pc:0)) & 0xffff];
				};
			}
		}
	},
	isReg: function(r) {
		return (typeof this.getReg(r) != 'undefined');
	},
	getReg: function(r) {
		return this.registers[r.toLowerCase()];
	},
	parseOp: function (tokens,labels,debugLine) {
		var token=tokens.getNext();
		
		var isMem=false;
		if (token.type=='[') {
			isMem=true;
			token=tokens.getNext();
		}
		
		var op1=token;
		var op2=false;
		
		if (isMem) {
			token=tokens.getNext();
			
			if (token.type=='+') {
				token=tokens.getNext();
				op2=token;
				token=tokens.getNext();
			}
			
			if (token.type==']') {
			} else {
				this.debugInfo.errors.push({ line: this.ln, text: token.text, type: 'error', message: 'expected ] or +'});
			}
			
			if (op2) {
				var reg,val;
				if (this.isReg(op1.text)) {
					var reg=op1;
					var val=op2;
				} else if (this.isReg(op2.text)) {
					var reg=op2;
					var val=op1;
				} else {
					this.debugInfo.errors.push({ line: this.ln, text: "[" + op1.text + " + " + op2.text + "]", type: 'error', message: 'Unsupported addressing mode'});
					return {pc:0, opcode:0, words: []};
				}
				
				var regVal=this.getReg(reg.text);
				
				if (regVal < 8) {
					return{ pc: 1,
						opcode: regVal + 0x10,
						words: [this.parseValue(val,labels,debugLine)]
					};
				} else if (regVal==this.getReg('sp')) {
					return { pc: 1,
						opcode: 0x1a,
						words: [this.parseValue(val,labels,debugLine)]
					};
				} else {
					this.debugInfo.errors.push({ line: this.ln, text: "[" + op1.text + " + " + op2.text + "]", type: 'error', message: 'Unsupported addressing mode'});
					return {pc:0, opcode:0, words: []};
				}
			}
		}
		
		
		if (this.isReg(op1.text)) {
			var ret={
				pc: 0,
				opcode: this.getReg(op1.text),
				words: []
			}
			
			if (isMem) {
				if (ret.opcode<8) {
					ret.opcode+=8;
				} else if (ret.opcode==this.registers['sp']) {
					ret.opcode=this.registers['peek'];
				} else {
					this.debugInfo.errors.push({ line: this.ln, text: "[" + op1.text + "]", type: 'error', message: 'Unsupported addressing mode'});
					ret={pc:0, opcode:0, words: []};
				}
			} else if (ret.opcode==this.getReg('pick')) {
				ret.pc++;
				ret.words.push(this.parseValue(tokens.getNext(),labels,debugLine));
			}
			
			return ret;
		} else {
			var numVal=this.parseValue(op1,labels,debugLine);
			
			if (!isMem && !isFunc(numVal) && ((numVal< 31 && numVal >= -1) || numVal==0xffff)) {
				return {
					pc: 0,
					opcode: (numVal+33) & 0x3f,
					words: []
				};
			} else {
				return {
					pc: 1,
					opcode: isMem?0x1e:0x1f,
					words: [numVal]
				};
			}
		}					
	},
	registers: {
		a: 0, r0: 0, b: 1, r1: 1, c: 2, r2: 2,
		x: 3, y: 4, z: 5, i: 6, j: 7,
		r3: 3, r4: 4, r5: 5, r6: 6, r7: 7,
		pop: 0x18, peek: 0x19, push: 0x18, stack: 0x18,
		sp: 0x1b, pc: 0x1c, o: 0x1d, ex: 0x1d,
		pick: 0x1a
	}
		
}

function createInstr(o,b,a) {
	return (((a << 5) + b) << 5) + o;
}

function getSpecialInstructionBuilder(opcode) {
	return function(tokens,labels,debugLine) {
			var p=this.asm.parseOp(tokens,labels,debugLine);
			return { pc: p.pc + 1,
				  words: [
					createInstr(0,opcode,p.opcode),
					p.words
				  ]	
				};
		}
}

var Tokenizer=new Class({
	init: function(tokenspec) {
		this.completeRE=new RegExp(tokenspec.REs.join('|') + "|.",'g');
		
		this.types=tokenspec.types;
		this.REs=[];
		
		for(var i=0;i<tokenspec.REs.length;i++) {
			var re=tokenspec.REs[i];
			
			this.REs.push(new RegExp('^' + re + '$'));
		}
		
	},
	tokenize: function(text) {
		var matches=text.match(this.completeRE);
		var tokens=[];
		for(var i=0;i<matches.length;i++) {
			var m=matches[i];
			var type='UNKNOWN';
			for(var j=0;j<this.REs.length && type=='UNKNOWN';j++) {
				if (m.match(this.REs[j])) type=this.types[j];
			}
			
			tokens.push({type: type, text: m});
		}
		
		return {tokens: tokens, getNext: this.getNext, hasNext: this.hasNext};
			
	},
	getNext: function(space) {
		if (this.hasNext(space)) {
			return this.tokens.shift();
		} else {
			return {type: 'END', text: ''};
		}
	},
	hasNext: function(space) {
		while(this.tokens.length>0 && (space || this.tokens[0].type=='space')) {
			this.tokens.shift();
		}
		
		return this.tokens.length>0;
	}
});
	