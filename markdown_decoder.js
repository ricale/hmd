if(typeof(RICALE) == typeof(undefined)) {
	/**
	 * @namespace 네임스페이스
	 * @auther ricale
 	 * @version 1
 	 * @description 다른 사람의 구현과의 충돌을 피하기 위한 최상위 네임스페이스
	 */
	var RICALE = {};
}

// 줄 당 번역 결과를 담기 위한 클래스
// 근데 이거 굳이 클래스로 만들 필요 있나?
RICALE.MarkdownSentence = function() {
	// 어떤 마크다운 문법이 적용되었는지 (어떤 태그와 매치되었는지) 구별할 용도의 문자열
	this.tag = null;
	// 마크다운이 적용된 문자열 본문
	this.child = null;
	// 적용된 마크다운 문법이 리스트 관련일 경우 리스트의 레벨
	this.level = null;
	// 적용된 마크다운 문법에 인용이 있을 경우 인용의 중첩 정도
	this.quote = 0;
}

RICALE.MarkdownSentence.prototype = {

}



// 마크다운 문법을 HTML 문법으로 번역하는 클래스
// 인자로 sourceElement(번역할 내용이 작성되어 있는 요소)와
// targetElement(번역한 결과가 들어갈 요소)를 받는다.
// - 번역은 translate 메서드를 호출하면 된다.
// - translate로 sourceElement랑 targetElement를 받는 게 더 낫지 않나?
RICALE.MarkdownDecoder = function(sourceElement, targetElement) {
	// 번역할 내용이 들어있는 요소
	this.source = sourceElement;
	// 번역한 결과가 들어갈 요소
	this.target = targetElement;

	// 줄 별 번역 결과(RICALE.MarkdownSentence)의 배열
	this.result = Array();

	this.referencedId = {};

	// 목록 요소의 레벨 계산을 위한 배열 (정수)
	this.listLevel = Array();
	this.lastListLevel = 0;

	// 어떤 마크다운 문법이 적용되었는지 구별할 문자열들 (키값)
	this.P = "p";
	this.CONTINUE = "continue"; //< 인용/목록에서 p가 길게 쓰일 때를 구분하기 위한 상수
	this.BLOCKQUOTE = "blockquote";
	this.BLANK = "blank";
	this.H1 = "h1";
	this.H2 = "h2";
	this.H3 = "h3";
	this.H4 = "h4";
	this.H5 = "h5";
	this.H6 = "h6";
	this.CODEBLOCK = "codeblock";
	this.HR = "hr";
	this.UL = "ul";
	this.OL = "ol";

	this.REFERENCED = "referencedId"

	this.EM = "em";
	this.STRONG = "strong";
	this.CODE = "code";
	this.IMG_INLINE = "img_inline";
	this.IMG_REFERENCE = "img_reference";
	this.IMG_ID = "img_id";
	this.LINK_INLINE = "a_inline";
	this.LINK_REFERENCE = "a_reference";
	this.LINK_AUTO = "a_auto";

	// 마크다운 문법을 구분하기 위한 정규 표현식들
	this.regExp = [ 
		{ key : this.HR, exp : /(^[ ]{0,3}[-]+[ ]*[-]+[ ]*[-]+[ ]*$)|(^[ ]{0,3}[_]+[ ]*[_]+[ ]*[_]+[ ]*$)|(^[ ]{0,3}[\*]+[ ]*[\*]+[ ]*[\*]+[ ]*$)/ },
		{ key : this.UL, exp : /^([\s]*)[\*+-][ ]+(.*)$/ },
		{ key : this.OL, exp : /^([\s]*)[\d]+\.[ ]+(.*)$/ },
		{ key : this.BLANK,      exp : /(^[\s]*$)|(^$)/ },
		{ key : this.H1,         exp : /^# (.*)(#*)$/ },
		{ key : this.H2,         exp : /^#{2} (.*)(#*)$/ },
		{ key : this.H3,         exp : /^#{3} (.*)(#*)$/ },
		{ key : this.H4,         exp : /^#{4} (.*)(#*)$/ },
		{ key : this.H5,         exp : /^#{5} (.*)(#*)$/ },
		{ key : this.H6,         exp : /^#{6} (.*)(#*)$/ },
		{ key : this.CODEBLOCK,  exp : /^([ ]{0,3}\t|[ ]{4})([ \t]{0,}.+)$/ },
		{ key : this.REFERENCED, exp : /^\s*\[(.+)\]:\s*([^\s]+)$/ }
	];

	// 인용 구분을 위한 정규 표현식
	// this.matchBlockquotes 함수에서만 쓰인다.
	this.regExpBlockquote = /^(>+)[ ]([ ]*.*)$/;

	// CONTINUE 를 구분하기 위한 정규 표현식
	this.regExpContinuedListBelowBlank = /^[\s]{1,7}(.*)/;

	this.regExpInline = {};
	this.regExpInline[this.STRONG] = [
		/\*\*(.+)\*\*/g,
		/__(.+)__/g
	];
	this.regExpInline[this.EM] = [ 
		/\*(.+)\*/g,
		/_(.+)_/g
	];
	this.regExpInline[this.CODE] = [
		/`{2}(.+)`{2}/g,
		/`{1}(.+)`{1}/g
	];

	this.regExpLinks = [
		{ key : this.IMG_INLINE,    exp : /!\[(.+)\]\(([^\s]+) (".+")?\)/g }, // 주소 형식은 상관 없다.
		{ key : this.IMG_REFERENCE, exp : /!\[(.+)\]\s*\[(.*)\]/g },

		{ key : this.LINK_INLINE,    exp : /\[(.+)\]\(([^\s]+) (".+")?\)/g }, // 주소 형식은 상관 없다.
		{ key : this.LINK_REFERENCE, exp : /\[(.+)\]\s*\[(.*)\]/g },
		{ key : this.LINK_AUTO,      exp : /<.+>/g }, //< 꺽쇠괄호 안의 값은 무조건 주소 형식이어야 한다.
	]
}

RICALE.MarkdownDecoder.prototype = {

	// 번역한다.
	translate:function() {
		// 타겟 요소의 문자열을 줄 단위로 끊어 배열로 저장한다.
		var array = this.source.text().split(/\n/);

		// 한 줄 한 줄이 어떤 마크다운에 해당하는 지 체크한다.
		for(var i = 0, now = 0; i < array.length; i++) {

			this.result[now] = this.match(array[i], now);

			if(this.result[now].tag == this.REFERENCED) {
				continue;
			}

			// 이전까지 목록 요소들이었다가
			// 현재 줄에서 목록 요소가 아니게 되면 목록 관련 계산 배열을 초기화한다.
			if(this.listLevel.length > 0 
				&& this.result[now].tag != this.UL
				&& this.result[now].tag != this.OL
				&& this.result[now].tag != this.CONTINUE) {
				this.listLevel = Array();
			}

			now++;
		}

		// 줄 단위로 번역한된 것을 통합해서 해석
		this.decode();
	},

	// 문자열(string)이 어떤 마크다운과 매치되는 지 확인한다.
	// 현재 문자열의 줄번호(now)는, 어떠한 마크다운 문법과도 매치되지 않는 문장일 경우
	// 목록 요소로부터 늘어진 문단 요소인지 확인하기 위해 쓰인다.
	match: function(string, now) {
		// 인용 요소가 몇 번 사용되었는지 체크한다.
		var result = this.matchBlockquotes(string),
		    string = result.child;

		// 정규 표현식과 비교해 어떤 마크다운 문법이 쓰였는지 확인한다.
		for(var j = 1; j < this.regExp.length; j++) {

			var line = string.match(this.regExp[j].exp);

			// 매치되는 블록 값을 찾으면 태그의 종류와 내용을 저장한다.
			if(line != null) {
				result.tag = this.regExp[j].key;

				switch(result.tag) {
					case this.HR:
						result.child = "";
						break;

					case this.UL:
					case this.OL:
						// 이 목록 요소의 레벨이 몇인지 확인한다.
						var r = this.getListLevel(line[1]);

						// 레벨을 저장한다.
						// 단 레벨이 없다면 (getListLevel의 반환 값이 정수가 아니라면)
						// 다른 요소라는 뜻이므로 변경한다.
						if(typeof(r) == typeof(0)) {
							result.level = r;	
						} else {
							result.tag = r;
						}
						result.child = line[2];

						break;

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

					case this.REFERENCED:
						this.referencedId[line[1]] = line[2];
				} // end switch

				return result;
			} // end if
		} // end for

		// 목록 요소로부터 늘어진 문단 요소인지 확인한다.
		isContinued = this.matchContinuedList(string, now);

		if(isContinued != null) {
			return isContinued;
		}

		// 위의 어떠한 요소와도 매치되지 않는다면
		// 문단 요소로 판단한다.		
		result.tag = this.P;
		result.child = string;

		return result;		
	}, // end function match

	// 문자열(string)이 목록 요소로부터 늘어진 문단 요소 (CONTINUE) 인지 확인한다.
	// this.match에서밖에 쓰이지 않기 때문에 따로 함수로 작성할 필요는 없지만
	// 의미론적으로 분리하기 위해 별도의 함수를 만든다.
	// now는 이 문자열의 줄번호이다.
	matchContinuedList: function(string, now) {
		var result = new RICALE.MarkdownSentence();

		// 빈 줄을 제외하고, 바로 윗 줄에 대한 정보를 얻는다.
		var above = this.aboveExceptBlank(now);
		// 빈 줄을 포함한 바로 윗 줄에 대한 정보를 얻는다.
		var before = this.beforeLine(now);
		// CONTINUE 요소로써 문법적으로 적절한지 체크한다.
		var line = string.match(this.regExpContinuedListBelowBlank)

		// 빈 줄을 포함한 윗 줄이 존재하는 가운데,
		// 그 윗줄이 목록 혹은 CONTINUE 요소라면 이 줄 또한 CONTINUE 요소이다.
		if(before != null && (before.tag == this.UL || before.tag == this.OL || before.tag == this.CONTINUE)) {

			result.tag = this.CONTINUE;
			result.child = string;

			return result;

		// 빈 줄을 제외한 윗 줄이 존재하는 가운데
		// 그 윗 줄이 몰고 혹은 CONTINUE 요소이고
		// CONTINUE 요소로서 문법적으로 적절하다면
		// 이 줄 또한 CONTINUE 요소이다.
		} else if(above != null
		   && (above.tag == this.UL || above.tag == this.OL || above.tag == this.CONTINUE)
		   && line !== null) {

			result.tag = this.CONTINUE;
			result.child = line[1];

			return result;
		}

		// 위의 어떠한 사항에도 해당하지 않는다면 이 줄은 CONTINUE 요소가 아니다.
		return null;
	},

	// 이 줄(string)이 인용 요소에 포함된 줄인지,
	// 포함되어 있다면 인용 요소가 몇 번이나 중첩되어 있는지 체크한다.
	// this.match에서밖에 쓰이지 않기 때문에 따로 함수로 작성할 필요는 없지만
	// 의미론적으로 분리하기 위해 별도의 함수를 만든다.
	matchBlockquotes: function(string) {
		var result = new RICALE.MarkdownSentence();

		result.child = string;

		// 인용 문법에 포함되는지, 몇 번이나 중첩되는지 체크한다.
		while(true) {
			var line = result.child.match(this.regExpBlockquote);
			if(line == null) {
				break;
			}

			result.quote += line[1].length;
			result.child = line[2];
		}

		return result;
	},

	// 목록 요소의 레벨을 이 줄의 들여쓰기(blank)를 통해 얻는다.
	// this.match에서밖에 쓰이지 않기 때문에 따로 함수로 작성할 필요는 없지만
	// 의미론적으로 분리하기 위해 별도의 함수를 만든다.
	getListLevel: function(blank) {
		// 이 줄의 들여쓰기가 몇 탭(tab) 몇 공백(space)인지 확인한다.
		var indent = blank.match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g),
		    space = 0;

		// 공백으로만 계산하면 들여쓰기가 몇 칸이나 되는지 확인한다.
		// 탭은 4개의 공백으로 계산한다.
		if(indent != null) {
			for(var i = 0; i < indent.length; i++) {
				if(indent[i].match(/^[ ]{1,3}$/) != null) {
					space += indent[i].length;
				} else {
					space += 4;
				}
			}
		}

		// 현재 목록 레벨이 이어지지 않던 상황에서
		// a. 공백이 3 이하라면 목록의 레벨은 1이 된다.
		// b. 공백이 3 초과라면 이 줄은 목록 요소가 아니라 코드블록 요소이다.
		if(this.listLevel.length == 0) {
			if(space <= 3) {
				this.listLevel[0] = space;
				this.lastListLevel = 1;
				return this.lastListLevel;

			} else {
				return this.CODEBLOCK;
			}

		// 현재 목록 레벨이 1만 존재하는 상황에서
		// a. 목록 레벨 1과 들여쓰기가 같다면 이 줄은 레벨 1이 된다.
		// b. 목록 레벨 1과 들여쓰기가 틀리고 공백이 7 이하라면 레벨 2가 된다.
		// c. 공백이 7 초과라면 이 줄은 목록 요소가 아니라 코드블록 요소이다.
		} else if (this.listLevel.length == 1) {
			if(space == this.listLevel[0]) {
				this.lastListLevel = 1;
				return this.lastListLevel;

			} else if(space <= 7) {
				this.listLevel[1] = space;
				this.lastListLevel = 2;
				return this.lastListLevel;

			} else {
				return this.CODEBLOCK;
			}

		// 현재 목록 레벨이 2 이상 존재하는 상황에서
		// a. 공백이 일정 수치 이상이면 이 줄은 목록 요소가 아니라 CONTINUE 요소가 된다.
		// b. 공백이 바로 전 레벨보다 크고 일정 수치 미만이면 이 줄은 이전 레벨 + 1이다.
		// c. 공백이 전 레벨들 중 어떤 하나보다 수치가 작거나 같으면 해당 레벨이다.

		/* 목록이 두 단계 점프할만한 공백이 나왔을 때의 처리합시다.

		예를 들어
		목록 레벨
		1
		2
		3
		4
		5
		3
		5 <- 이런 식의 상황 */
		} else {
			var now = this.listLevel.length;

			if(space >= (now + 1) * 4) {
				return this.CONTINUE;

			} else if(space > this.listLevel[now - 1] && space < (now + 1) * 4) {
				this.listLevel[now] = space;
				this.lastListLevel = now + 1;
				return this.lastListLevel;

			} else {
				for(var i = this.lastListLevel - 1; i >= 0 ; i--) {
					max = i + 1 < this.listLevel.length ? this.listLevel[i + 1] : (this.listLevel.length + 1) * 4
					if(space >= this.listLevel[i] && space < max) {
						return i + 1;
					}
				}

				return this.CONTINUE;
			}

			console.log(this.lastListLevel + " " + this.listLevel.length)

			for(var i = this.lastListLevel - 1; i > 0 ; i--) {
				max = i + 1 < this.listLevel.length ? this.listLevel[i + 1] : (this.listLevel.length + 1) * 4
				if(space >= this.listLevel[i] && space < max) {
					return i + 1;
				}
			}

			return this.CONTINUE;
		}
	},

	// 빈 줄을 제외한 바로 윗줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	aboveExceptBlank: function(index) {
		for(var i = index - 1; i >= 0; i--) {
			if(this.result[i].tag != this.BLANK) {
				return this.result[i];
			}
		}

		return null;
	},

	// 빈 줄을 포함한 바로 윗줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	beforeLine: function(index) {
		return index > 1 ? this.result[index - 1] : null;
	},

	// 빈 줄을 제외한 바로 아랫줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	belowExceptBlank: function(index) {
		for(var i = index + 1; i < this.result.length; i++) {
			if(this.result[i].tag != this.BLANK) {
				return this.result[i];
			}
		}

		return null;
	},

	// 빈 줄을 포함한 바로 아랫줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	nextLine: function(index) {
		return index < this.result.length - 1 ? this.result[index + 1] : null;
	},

	decodeInline: function(string) {
		for(var i = 0; i < this.regExpInline[this.STRONG].length; i++) {
			string = string.replace(this.regExpInline[this.STRONG][i], '<strong>$1</strong>');
		}
		
		for(var i = 0; i < this.regExpInline[this.EM].length; i++) {
			string = string.replace(this.regExpInline[this.EM][i], '<em>$1</em>');
		}

		for(var i = 0; i < this.regExpInline[this.CODE].length; i++) {
			string = string.replace(this.regExpInline[this.CODE][i], '<code>$1</code>');
		}

		return string;
	},

	// 분석한 줄들을 토대로 전체 글을 번역한다.
	// this.translate에서 바로 하지 않는 이유는
	// 전후 줄의 상태에 따라 분석이 달라질 수 있기 때문이다.
	decode: function() {
		var string = "",
			// ul이 이어지던 상태였는가. 상태라면 레벨은 몇이었는가.
		    fUL = 0,
		    // ol이 이어지던 상태였는가. 상태라면 레벨은 몇이었는가.
		    fOL = 0,
		    // li가 이어지던 상태였는가.
		    fLI = false,
		    // p가 이어지던 상태였는가.
		    fP = false,
		    // 코드블록이 이어지던 상태였는가.
		    fCB = false,
		    // 인용이 이어지던 상태였는가.
		    fBQ = 0,
		    // CONTINUE가 이어지던 상태였는가.
		    fCONT = false;

		// 줄 단위로 확인한다.
		for(var i = 0; i < this.result.length; i++) {
			var line = "";
			    r = this.result[i],
			    above = this.aboveExceptBlank(i),
			    before = this.beforeLine(i),
			    below = this.belowExceptBlank(i),
			    next = this.nextLine(i);

			r.child = this.decodeInline(r.child);

			// 인용이 있고 이전 줄의 인용보다 레벨이 높다면
			// 높은 레벨 만큼 <blockquote> 태그 추가
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

					// 윗 줄이 코드블록이었거나 현재 인용 요소가 존재하고 있다면 공백도 내용에 추가한다.
					if((above != null && below != null && above.tag == this.CODEBLOCK && below.tag == this.CODEBLOCK)
						|| r.quote != 0) {
						line += r.child;
					}

					break;

				case this.UL:
					// 목록 레벨이 이전보다 높아졌다면 높아진 만큼 <ul> 추가
					if(fUL < r.level) {
						for(var j = 0; j < r.level - fUL; j++) {
							line += "<ul>"
						}
						fUL = r.level;
					}

					line += "<li>";
					fLI = true;

					// 1. 공백을 포함한 다음 줄이 존재하고
					// 2. 그 줄이 CONTINUE 요소라면
					// <p> 추가
					if(next != null && next.tag == this.CONTINUE) {
						line += "<p>";
						fCONT = true;
					}

					line += r.child;

					// a. 공백을 제외한 다음 줄이 존재하지 않거나
					// b. 공백을 제외한 다음 줄이 CONTINUE 요소가 아니라면
					// </li> 추가
					if(below == null || below.tag != this.CONTINUE) {
						line += "</li>";

						// 목록 레벨이 이전보다 낮아졌다면 낮아진 만큼 </ul> 추가
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
					// 목록 레벨이 이전보다 높아졌다면 높아진 만큼 <ol> 추가
					if(fOL < r.level) {
						for(var j = 0; j < r.level - fOL; j++) {
							line += "<ol>"
						}
						fOL = r.level;
					}

					line += "<li>";
					fLI = true;

					// 1. 공백을 포함한 다음 줄이 존재하고
					// 2. 그 줄이 CONTINUE 요소라면
					// <p> 추가
					if(next != null && next.tag == this.CONTINUE) {
						line += "<p>";
						fCONT = true;
					}

					line += r.child;

					// a. 공백을 제외한 다음 줄이 존재하지 않거나
					// b. 공백을 제외한 다음 줄이 CONTINUE 요소가 아니라면
					// </li> 추가
					if(below == null || below.tag != this.CONTINUE) {
						line += "</li>";

						// 목록 레벨이 이전보다 낮아졌다면 낮아진 만큼 </ol> 추가
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
					// CONTINUE 가 시작하지 않은 가운데 CONTINUE 요소가 나왔다면 <p> 추가
					if(!fCONT) {
						line += "<p>";
						fCONT = true;
					}

					line += r.child;

					// 1. 공백을 포함한 다음 줄이 존재하고
					// 2. 그 줄이 CONTINUE 요소가 아니라면
					// </p> 추가
					if(next != null && next.tag != this.CONTINUE) {
						line += "</p>";
						fCONT = false;

						if(below == null || below.tag != this.CONTINUE) {
							line += "</li>";

							// 목록 레벨이 이전보다 낮아졌다면 낮아진 만큼 </ol> 추가
							var level = below != null ? below.level : 0;
							if(fOL > level) {
								for(var j = 0; j < fOL - level; j++) {
									line += "</ol>"
								}
								fOL = level;
							}

							var level = below != null ? below.level : 0;
							if(fUL > level) {
								for(var j = 0; j < fUL - level; j++) {
									line += "</ul>"
								}
								fUL = level;
							}
						}
					}

					break;

				case this.CODEBLOCK:
					// 코드블록이 시작하지 않은 가운데 코드블록 요소가 나왔다면 <pre><code> 추가
					if(!fCB) {
						line += "<pre><code>";
						fCB = true;
					}

					line += r.child;

					// a. 공백을 제외한 다음 줄이 존재하지 않거나
					// b. 공백을 제외한 다음 줄이 코드블록 요소가 아니거나
					// c. 공백을 제외한 다음 줄의 인용 레벨이 현재보다 높다면
					// </code></pre> 태그를 추가한다.
					if(below == null || below.tag != this.CODEBLOCK || below.quote > r.quote) {
						line += "</code></pre>"
						fCB = false;
					}

					break;

				case this.P:
					// 문단이 시작하지 않은 가운데 목록 요소가 나왔다면 <p> 추가
					if(!fP) {
						line += "<p>";
						fP = true;
					}

					line += r.child;

					// a. 공백을 포함한 다음 줄이 존재하지 않거나
					// b. 공백을 포함한 다음 줄이 문단 요소가 아니거나
					// c. 공백을 제외한 다음 줄의 인용 레벨이 현재보다 높다면
					// </p> 태그를 추가한다.
					if(next == null || next.tag != this.P || below.quote > r.quote) {
						line += "</p>";
						fP = false;
					}
					break;

				default:
					line += r.child;
					break;
			}

			// a. 빈 줄을 제외한 아래 줄이 없거나 (마지막 줄이거나)
			// b. 1. 빈 줄을 제외한 아래 줄이 이 줄 인용보다 레벨이 낮고 
			//    2. 빈 줄을 포함한 바로 아래 줄이 빈 줄이며 인용 레벨이 0이라면
			// </blockquote> 태그를 추가한다.
			if(below == null || (below.quote < fBQ && (next.tag == this.BLANK && next.quote == 0))) {
				var quote = below != null ? below.quote : 0
				for(var j = 0; j < fBQ - quote; j++) {
					line += "</blockquote>";
				}

				fBQ = quote;
			}

			var debug = this.result[i].quote + "    " + this.result[i].tag + "    " + this.result[i].level + "    " + this.result[i].child;
			console.log(debug);

			console.log(line);
			string += line;
		}

		this.target.html(string);
	}
} // RICALE.MarkdownDecoder.prototype


var decoder;
// 사용 예제 코드
$(document).ready(function() {
	decoder = new RICALE.MarkdownDecoder($('#source'), $('#target'));
	$('#source').click(function() {
		decoder.translate();
	});
});