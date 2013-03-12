/*
.cm-s-default span.cm-keyword {color: #708;}
.cm-s-default span.cm-atom {color: #219;}
.cm-s-default span.cm-number {color: #164;}
.cm-s-default span.cm-def {color: #00f;}
.cm-s-default span.cm-variable {color: black;}
.cm-s-default span.cm-variable-2 {color: #05a;}
.cm-s-default span.cm-variable-3 {color: #085;}
.cm-s-default span.cm-property {color: black;}
.cm-s-default span.cm-operator {color: black;}
.cm-s-default span.cm-comment {color: #a50;}
.cm-s-default span.cm-string {color: #a11;}
.cm-s-default span.cm-string-2 {color: #f50;}
.cm-s-default span.cm-meta {color: #555;}
.cm-s-default span.cm-error {color: #f00;}
.cm-s-default span.cm-qualifier {color: #555;}
.cm-s-default span.cm-builtin {color: #30a;}
.cm-s-default span.cm-bracket {color: #cc7;}
.cm-s-default span.cm-tag {color: #170;}
.cm-s-default span.cm-attribute {color: #00c;}
.cm-s-default span.cm-header {color: blue;}
.cm-s-default span.cm-quote {color: #090;}
.cm-s-default span.cm-hr {color: #999;}
.cm-s-default span.cm-link {color: #00c;}
*/

/*
this.tokenizer=new Tokenizer({
			types: ['singlequote','doublequote','comma','label','[',']','space','num','num','+','relative','word','sym'],
			REs: ['[\'][^\']*[\']','["][^"]*["]',',',':\\w+','\\[','\\]','\\s+','0x[a-fA-F\\d]+','[+-]?\\d+','\\+','r{\\w+}','\\w+','.']
		});
*/

CodeMirror.defineMode("dcpu",function(config,parserConfig) {
	
	var instructions=['set','add','sub','mul','mli','div','dvi','mod','and','bor','xor','shr','asr','shl','sti','ifb','ifc',
		'ife','ifn','ifg','ifa','ifl','ifu','adx','sbx','sti','std','jsr','ret','brk','hlt','dat','int','iag','ias',
		'rfi','iaq','hwn','hwi','hwq'];
	var regs=['a','b','c','x','y','z','i','j','sp','pc','o','ex','pick','push','pop'];
	
	return {
		token: function(stream,state) {
			if (stream.eatSpace()) return 'whitespace';
			var ch=stream.peek();
			//stream.next();
			//return 'atom';
			if (ch == ';') {
				stream.skipToEnd();
				return 'comment';
			} else if (ch==":") {
				stream.next();
				stream.eatWhile(/\w/);
				return 'meta';
			} else if (ch=="'" || ch=='"') {
				stream.next();
				stream.eatWhile(function(c) { return (c!=ch); });
				return 'string';
			} else if (ch == ',' || ch == '+' || ch == '[' || ch== ']') {
				stream.next();
				return 'operator';
			} else if (ch=='-') {
				stream.next();
				stream.eatWhile(/\d/);
				return 'number';
			} else {
				if (stream.match(/^0x[a-f0-9]+/,true,true) || stream.eatWhile(/\d/)) {
					return 'number';
				}
				
				stream.next();
				stream.eatWhile(/\w/);
				
				var cur=stream.current().toLowerCase();
				
				for (var i=0;i<regs.length;i++) {
					if (cur==regs[i]) {
						return 'variable';
					}
				}
				
				for(var i=0;i<instructions.length;i++) {
					if (cur==instructions[i]) {
						return 'keyword';
					} 
				}
				
				return 'atom';
			}
		}
	};
	
});

