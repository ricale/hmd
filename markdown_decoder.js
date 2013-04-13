if(typeof(RICALE) == typeof(undefined)) {
	/**
	 * @namespace 네임스페이스
	 * @auther ricale
 	 * @version 1
 	 * @description 다른 사람의 구현과의 충돌을 피하기 위한 최상위 네임스페이스
	 */
	var RICALE = {};
}

RICALE.MarkdownSentence = function() {
	// 어떤 마크다운 문법이 적용되었는지 (어떤 태그와 매치되었는지) 구별할 용도의 문자열
	this.tag = null;
	// 마크다운이 적용된 문자열 본문
	this.child = null;
	// 적용된 마크다운 문법이 리스트 관련일 경우 리스트의 레벨
	this.level = null;
	// 적용된 마크다운 문법이 인용일 경우 인용의 중첩 정도
	this.quote = 0;
}

RICALE.MarkdownSentence.prototype = {

	getText: function() {
		var self = this;
		while(true) {
			if(typeof(self.child) == typeof("string") || typeof(self.child) == typeof(null)) {
				return self.child;
			}

			self = self.child;
		}
	}
}




RICALE.MarkdownDecoder = function(targetElement) {
	this.target = targetElement;

	// 어떤 마크다운 문법이 적용되었는지 판별한 결과들
	// 줄 별로 저장되어있다.
	this.result = Array();

	this.nowList1Level = null;
	this.nowList2Level = null;

	this.listLevel = Array();

	// 어떤 마크다운 문법이 적용되었는지 구별할 문자열들
	this.P = "p";
	this.BLANK = "blank"; // easy
	this.BLOCKQUOTE = "blockquote";
	this.H1 = "h1"; // easy
	this.H2 = "h2"; // easy
	this.H3 = "h3"; // easy
	this.H4 = "h4"; // easy
	this.H5 = "h5"; // easy
	this.H6 = "h6"; // easy
	this.UL = "ul";
	this.OL = "ol";
	this.CODEBLOCK = "codeblock";
	this.HR = "hr"; // easy
	this.CONTINUE = "continue";

	// 어떤 마크다운 문법이 적용되었는지 판별할 정규 표현식들
	this.regExp = [ 
		{ key : this.BLOCKQUOTE, exp : /^([>]+)[ ]([ ]*.*)$/ },
		{ key : this.BLANK,      exp : /(^[\s]*$)|(^$)/ },
		{ key : this.H1,         exp : /^# (.*)(#*)$/ },
		{ key : this.H2,         exp : /^#{2} (.*)(#*)$/ },
		{ key : this.H3,         exp : /^#{3} (.*)(#*)$/ },
		{ key : this.H4,         exp : /^#{4} (.*)(#*)$/ },
		{ key : this.H5,         exp : /^#{5} (.*)(#*)$/ },
		{ key : this.H6,         exp : /^#{6} (.*)(#*)$/ },
		{ key : this.CODEBLOCK,  exp : /^([ ]{0,3}\t|[ ]{4})([ \t]{0,}.+)$/ }
	];

	this.regExpForList = [
		{ key : this.HR, exp : /(^[ ]{0,3}[-]+[ ]*[-]+[ ]*[-]+[ ]*$)|(^[ ]{0,3}[_]+[ ]*[_]+[ ]*[_]+[ ]*$)|(^[ ]{0,3}[\*]+[ ]*[\*]+[ ]*[\*]+[ ]*$)/ },
		{ key : this.UL, exp : /^([\s]*)[\*+-][ ]+(.*)$/ },
		{ key : this.OL, exp : /^([\s]*)[\d]+\.[ ]+(.*)$/ },
	]

	this.regExpContinuedListBelowBlank = /^[\s]{1,7}(.*)/;
}

RICALE.MarkdownDecoder.prototype = {

	start:function() {
		// 타겟 요소의 모든 글을 줄 단위로 끊어 배열로 저장한다.
		var array = this.target.text().split(/\n/),
		    now = 0;

		// 한 줄 한 줄이 어떤 마크다운에 해당하는 지 체크한다.
		for(var i = 0; i < array.length; i++) {

			// 목록 혹은 수평선에 해당하는 지 먼저 확인한다.
			// 아래 'UL 혹은 OL 혹은 UL/OL의 연장'을 구분하기 이전에 선행되지 않으면
			// 목록과 구분되지 않는다.
			this.result[now] = this.matchList(array[i]);

			// 목록 혹은 수평선이라면 continue;
			if(this.result[now] == null) {

				// 위와 같은 상황이 아니라면
				// 다른 일반적인 마크다운 문법을 체크한다.
				this.result[now] = this.match(array[i], now);
			}

			if(this.listLevel.length > 0 
				&& this.result[now].tag != this.UL
				&& this.result[now].tag != this.OL
				&& this.result[now].tag != this.CONTINUE) {
				this.listLevel = Array();
			}
			
			now++;
		}
/*
		var debug = "<table><tr><th></th><th>인용</th><th>태그</th><th>레벨</th><th>내용</th></tr>";

		for(var i = 0; i < this.result.length; i++) {
			debug += "<tr><td>" + i + "</td><td>" + this.result[i].quote + "</td><td>" + this.result[i].tag + "</td><td>" + this.result[i].level + "</td><td>" ;

			if(typeof(this.result[i].child) == typeof("string")) {
				debug += this.result[i].child + "</td></tr>";
			} else {
				debug += "<span>" + this.result[i].child.quote + "</span> <span>" + this.result[i].child.tag
				  + "</span> <span>" + this.result[i].child.level + "</span> <span>" + this.result[i].child.child + "</span></td></tr>";
			}
		}

		debug += "</table>";

		this.target.html(debug);
*/
		this.decode();
	},

	match: function(string, now) {
		var result = this.matchBlockquotes(string),
		    string = result.child;

		for(var j = 1; j < this.regExp.length; j++) {

			var line = string.match(this.regExp[j].exp);
			// 매치되는 블록 값을 찾으면
			// 태그의 종류와 태그의 내용을
			// 저장한다.
			if(line != null) {
				result.tag = this.regExp[j].key;

				switch(result.tag) {
					case this.BLANK:
						result.child = "";
						break;

					case this.H1:
					case this.H2:
					case this.H3:
					case this.H4:
					case this.H5:
					case this.H6:
						result.child = line[1];
						break;

					case this.CODEBLOCK:
						result.child = line[2];
						break;
				} // end switch

				return result;
			} // end if
		} // end for

		isContinued = this.matchContinuedList(string, now);

		if(isContinued != null) {
			return isContinued;
		}
		
		result.tag = this.P;
		result.child = string;

		return result;		
	}, // end function match

	matchList: function(string) {
		var result = this.matchBlockquotes(string),
		    string = result.child;

		for(var i = 0; i < this.regExpForList.length; i++) {

			var line = string.match(this.regExpForList[i].exp);
			// 매치되는 블록 값을 찾으면
			// 태그의 종류와 태그의 내용을
			// 저장한다.
			if(line != null) {
				result.tag = this.regExpForList[i].key;

				switch(result.tag) {
					case this.HR:
						result.child = "";
						break;

					case this.UL:
					case this.OL:
						var r = this.getListLevel(line[1]);

						if(typeof(r) == typeof(0)) {
							result.level = r;	
						} else {
							result.tag = r;
						}
						result.child = line[2];

						break;
				} // end switch

				var debug = result.quote + "    " + result.tag + "    " + result.level + "    " + result.child;
				console.log(debug);
				return result;
			} // end if
		}

		return null;
	},

	matchContinuedList: function(string, now) {
		var result = new RICALE.MarkdownSentence();

		// 빈 줄을 제외하고, 바로 윗 줄에 대한 정보를 얻는다.
		var above = this.aboveExceptBlank(now);
		var line = string.match(this.regExpContinuedListBelowBlank)
		var before = this.beforeLine(now);

		if(before != null && (before.tag == this.UL || before.tag == this.OL || before.tag == this.CONTINUE)) {

			result.tag = this.CONTINUE;
			result.child = string;

			return result;

		} else if(above != null
		   && (above.tag == this.UL || above.tag == this.OL || above.tag == this.CONTINUE)
		   && line !== null) {

			result.tag = this.CONTINUE;
			result.child = line[1];

			return result;
		}

		return null;
	},

	matchBlockquotes: function(string) {
		var result = new RICALE.MarkdownSentence();

		result.child = string;

		while(true) {
			var line = result.child.match(this.regExp[0].exp);
			if(line == null) {
				break;
			}

			result.quote += line[1].length;
			result.child = line[2];
		}

		return result;
	},

	getListLevel: function(blank) {
		var indent = blank.match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g),
		    space = 0;

		if(indent != null) {
			for(var i = 0; i < indent.length; i++) {
				if(indent[i].match(/^[ ]{1,3}$/) != null) {
					space += indent[i].length;
				} else {
					space += 4;
				}
			}
		}

		if(this.listLevel.length == 0) {
			if(space <= 3) {
				this.listLevel[0] = space;
				return 1;

			} else {
				return this.CODEBLOCK;
			}

		} else if (this.listLevel.length == 1) {
			if(space == this.listLevel[0]) {
				return 1;

			} else if(space <= 7) {
				this.listLevel[1] = space;
				return 2;

			} else {
				return this.CODEBLOCK;
			}

		} else {
			var now = this.listLevel.length;

			if(space >= (now + 1) * 4) {
				return this.CONTINUE;

			} else if(space > this.listLevel[now - 1] && space < (now + 1) * 4) {
				this.listLevel[now] = space;
				return now + 1;

			} else {
				for(var i = this.listLevel.length - 1; i >= 0 ; i--) {
					if(space >= this.listLevel[i]) {
						return i + 1;
					}
				}
			}
		}
	},

	aboveExceptBlank: function(index) {
		for(var i = index - 1; i >= 0; i--) {
			if(this.result[i].tag != this.BLANK) {
				return this.result[i];
			}
		}

		return null;
	},

	beforeLine: function(index) {
		return index > 1 ? this.result[index - 1] : null;
	},

	belowExceptBlank: function(index) {
		for(var i = index + 1; i < this.result.length; i++) {
			if(this.result[i].tag != this.BLANK) {
				return this.result[i];
			}
		}

		return null;
	},

	nextLine: function(index) {
		return index < this.result.length - 1 ? this.result[index + 1] : null;
	},

	decode: function() {
		var string = "",
		    fUL = 0,
		    fOL = 0,
		    fLI = false,
		    fP = false,
		    fCB = false,
		    fBQ = 0,
		    fCONT = false;

		for(var i = 0; i < this.result.length; i++) {
			var line = "";
			    r = this.result[i],			    
			    above = this.aboveExceptBlank(i),
			    before = this.beforeLine(i),
			    below = this.belowExceptBlank(i),
			    next = this.nextLine(i);

			    

			if(r.quote > 0 && r.quote > fBQ) {
				for(var j = 0; j < r.quote - fBQ; j++) {
					line += "<blockquote>";
				}

				fBQ = r.quote;
			}

			switch(r.tag) {
				case this.H1:
					line += "<h1>" + r.child + "</h1>";
					break;
				case this.H2:
					line += "<h2>" + r.child + "</h2>";
					break;
				case this.H3:
					line += "<h3>" + r.child + "</h3>";
					break;
				case this.H4:
					line += "<h4>" + r.child + "</h4>";
					break;
				case this.H5:
					line += "<h5>" + r.child + "</h5>";
					break;
				case this.H6:
					line += "<h6>" + r.child + "</h6>";
					break;
				case this.HR:
					line += "<hr/>";
					break;
				case this.BLANK:

					if((above != null && below != null && above.tag == this.CODEBLOCK && below.tag == this.CODEBLOCK)
						|| r.quote != 0) {
						line += r.child;
					} else {
						continue;
					}

					break;

				case this.UL:
					if(fUL < r.level) {
						for(var j = 0; j < r.level - fUL; j++) {
							line += "<ul>"
						}
						fUL = r.level;
					}

					line += "<li>";
					fLI = true;

					if(next != null && next.tag == this.CONTINUE) {
						line += "<p>";
						fCONT = true;
					}

					line += r.child;

					if(below == null || below.tag != this.CONTINUE) {
						line += "</li>";

						var level = below != null ? below.level : 0;
						if(fUL > level) {
							for(var j = 0; j < fUL - level; j++) {
								line += "</ul>"
							}
							fUL = level;
						}
					}

					break;

				case this.OL:
					if(fOL < r.level) {
						for(var j = 0; j < r.level - fOL; j++) {
							line += "<ol>"
						}
						fOL = r.level;
					}

					line += "<li>";
					fLI = true;

					if(next != null && next.tag == this.CONTINUE) {
						line += "<p>";
						fCONT = true;
					}

					line += r.child;

					if(below == null || below.tag != this.CONTINUE) {
						line += "</li>";

						var level = below != null ? below.level : 0;
						if(fOL > level) {
							for(var j = 0; j < fOL - level; j++) {
								line += "</ol>"
							}
							fOL = level;
						}
					}

					break;

				case this.CONTINUE:
					if(!fCONT) {
						line += "<p>";
						fCONT = true;
					}

					line += r.child;

					if(next != null && next.tag != this.CONTINUE) {
						line += "</p>";
						fCONT = false;
					}

					break;

				case this.CODEBLOCK:
					if(!fCB) {
						line += "<pre><code>";
						fCB = true;
					}

					line += r.child;

					if(below == null || below.tag != this.CODEBLOCK || below.quote > r.quote) {
						line += "</code></pre>"
						fCB = false;
					}

					break;

				case this.P:
					if(!fP) {
						line += "<p>";
						fP = true;
					}

					line += r.child;

					if(next == null || next.tag != this.P || below.quote > r.quote) {
						line += "</p>";
						fP = false;
					}
					break;

				default:
					line += r.child;
					break;
			}

			if(below == null || (below.quote < fBQ && (next == null || (next.tag == this.BLANK && next.quote == 0)))) {

				console.log(fBQ);
				var quote = below != null ? below.quote : 0
				for(var j = 0; j < fBQ - quote; j++) {
					line += "</blockquote>";
					console.log("!");
				}
				fBQ = quote;

				console.log(fBQ);
			}

			var debug = this.result[i].quote + "    " + this.result[i].tag + "    " + this.result[i].level + "    " + this.result[i].child;
			console.log(debug);

			console.log(line);
			string += line;
		}

		this.target.html(string);
	}
} // RICALE.MarkdownDecoder.prototype

$(document).ready(function() {
	var decoder = new RICALE.MarkdownDecoder($('#test'));
	decoder.start();
});