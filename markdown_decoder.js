// project handmade markdown decoder (hmd)
// version 0.1
// written by ricale
// ricale@hanmail.net or kim.kangseong@gmail.com

// _주의! 현재 작성된 주석들은 명확하지 않은 부분이 많을 수도 있습니다._
// 특히 코드를 그대로 한글로 옮겨놓았을 뿐이라서 이해에 도움이 되지 않는 부분도 있습니다.
// 차차 정리하고 사용하는 단어들도 일관성 있게 정리할 예정입니다.

if(typeof(RICALE) == typeof(undefined)) {
	// 다른 사람과의 이름 충돌을 피하기 위한 최상위 네임스페이스
	var RICALE = {};
}

RICALE.HMD = {};

// 용어 정리
// 해석 : 입력된 마크다운이 어떤 HTML 요소인지 확인
// 번역 : 해석한 결과에 따라 마크다운을 HTML 형식으로 변환

// 줄 당 해석 결과를 담기 위한 클래스
RICALE.HMD.TranslateSentence = function() {
	// 어떤 마크다운 문법이 적용되었는지 (어떤 HTML 태그와 매치되는지) 구별할 용도의 문자열
	this.tag = null;
	// 마크다운이 적용된 문자열 본문
	this.child = null;
	// 적용된 마크다운 문법이 리스트 관련일 경우 리스트의 레벨
	this.level = 0;
	// 적용된 마크다운 문법에 인용이 있을 경우 인용의 중첩 정도
	this.quote = 0;
}

RICALE.HMD.ReferencedId = function(url, title) {
	this.url = url;
	this.title = title;
}



// 마크다운 문법을 HTML 문법으로 번역하는 클래스
// targetElement(번역한 결과가 들어갈 요소)를 받는다.
// - 번역은 translate 메서드를 호출하면 된다.
RICALE.HMD.Decoder = function(targetElement) {
	// 번역한 결과가 들어갈 HTML 요소
	this.target = targetElement;

	// 줄 별 해석 결과(RICALE.HMD.TranslateSentence)의 배열
	this.result = Array();

	// 레퍼런스 스타일의 링크/이미지 기능에서 쓰일 참조 아이디의 링크주소/제목
	// (아이디) - (주소/제목 객체)의 key - value 스타일
	this.refId = {};

	// 목록 요소의 레벨 계산을 위한 (정수) 배열
	this.listLevel = Array();
}

RICALE.HMD.Decoder.prototype = {
	// 어떤 마크다운 문법이 적용되었는지 구별할 문자열들 (키값)
	P: "p",
	H1: "h1",
	H2: "h2",
	H3: "h3",
	H4: "h4",
	H5: "h5",
	H6: "h6",
	HR: "hr",
	UL: "ul",
	OL: "ol",
	BLANK: "blank",
	CODEBLOCK: "codeblock",
	BLOCKQUOTE: "blockquote",


	// # 블록 요소 마크다운의 정규 표현식들


	// 주의할 점
	// 1. HR보다 UL을 먼저 체크하면 몇몇 상황에서 HR이 UL로 처리될 수 있다.
	// 2. HR보다 CODEBLOCK을 먼저 체크하면 몇몇 상황에서 HR이 CODEBLOCK으로 처리될 수 있다.	

	regExpHR: /(^[ ]{0,3}[-]+[ ]*[-]+[ ]*[-]+[ ]*$)|(^[ ]{0,3}[_]+[ ]*[_]+[ ]*[_]+[ ]*$)|(^[ ]{0,3}[\*]+[ ]*[\*]+[ ]*[\*]+[ ]*$)/,
	regExpUL: /^([\s]*)[\*+-][ ]+(.*)$/,
	regExpOL: /^([\s]*)[\d]+\.[ ]+(.*)$/,
	regExpBlank: /(^[\s]*$)|(^$)/,
	regExpCodeblock: /^([ ]{0,3}\t|[ ]{4})([ \t]{0,}.+)$/,
	regExpReferencedId: [
		/^\s{0,3}\[([^\[\]]+)\]:\s*<([^\s<>]+)>\s*(['"(](.*)["'(])?$/,
		/^\s{0,3}\[([^\[\]]+)\]:\s*([^\s]+)\s*(['"(](.*)["'(])?$/
	],

	regExpHeading: /^(#{1,6}) (.*)(#*)$/,
	regExpH1Underlined: /^[=]+$/,
	regExpH2Underlined: /^[-]+$/,
	// 인용과 매핑되는 마크다운 정규 표현식
	regExpBlockquote: /^[ ]{0,3}(>+)[ ]([ ]*.*)$/,
	regExpBlockquoteNoIndent: /^(>+)[ ]([ ]*.*)$/,

	regExpContinuedList: /(^[\s]{1,8})([\s]*)(.*)/,

	// # 인라인 요소 마크다운의 정규 표현식들
	regExpStrong: [
		/\*\*([^\s]+.*[^\s]+)\*\*/g,
		/__([^\s]+.*[^\s]+)__/g
	],
	regExpEM: [ 
		/\*([^\s]+.*[^\s]+)\*/g,
		/_([^\s]+.*[^\s]+)_/g
	],
	regExpCode: [
		/`{2}(.+)`{2}/g,
		/`{1}(.+)`{1}/g
	],
	regExpImg: /!\[(.+)\]\s*\[(.*)\]/,
	regExpLink: /\[(.+)\]\s*\[(.*)\]/,
	regExpImgInline: [
		/!\[([^\[\]]+)\]\s*\(([^\s\(\)]+) "(.*)"\)/g,
		/!\[([^\[\]]+)\]\s*\(([^\s\(\)]+)\)/g
	],
	regExpLinkInline: [
		/\[([^\[\]]+)\]\s*\(([^\s\(\)]+) "(.*)"\)/g,
		/\[([^\[\]]+)\]\s*\(([^\s\(\)]+)\)/g
	],
	regExpLinkAuto: /<(http[s]?:\/\/.+)>/g,
	regExpBreak: /(  )$/,

	init: function() {
		this.result = Array();
		this.refId = {};
		this.listLevel = Array();
	},

	// 번역한다.
	translate: function(source) {
		this.init();

		// 타겟 요소의 문자열을 줄 단위로 끊어 배열로 저장한다.
		var array = source.split(/\n/);

		// 한 줄 한 줄이 어떤 마크다운에 해당하는 지 체크한다.
		for(var i = 0, now = 0; i < array.length; i++) {

			var result = this.match(array[i], now);
			console.log(result);

			// 참조 스타일의 링크/이미지 기능을 위한 참조 문자열이었다면
			// 실제로 보이는 문자열이 아니므로 지나친다.
			if(result == null) {
				continue;
			}

			this.result[now] = result;

			// 이전까지 목록 요소들이었다가
			// 현재 줄에서 목록 요소가 아니게 되면 목록 관련 계산 배열을 초기화한다.
			if(this.listLevel.length > 0 
				&& this.result[now].tag != this.BLANK
				&& this.result[now].level == 0) {
				this.listLevel = Array();
			}

			now++;
		}

		// 줄 단위로 해석한 것을 통합해서 번역한다.
		this.decode();
	},

	// 문자열(string)이 어떤 마크다운과 매치되는 지 확인한다.
	// 현재 문자열의 줄번호(now)는, 어떠한 마크다운 문법과도 매치되지 않는 문장일 경우
	// 목록 요소로부터 늘어진 문단 요소인지 확인하기 위해 쓰인다.
	match: function(string, now) {
		var result = this.matchBlockquotes(string, now),
		    line = null,
		    isContinuedList = false;

		line = result.child.match(this.regExpH1Underlined);
		if(line != null && now != 0 && this.result[now - 1].tag == this.P) {
			this.result[now - 1].tag = this.H1;
			return null;
		}

		line = result.child.match(this.regExpH2Underlined);
		if(line != null && now != 0 && this.result[now - 1].tag == this.P) {
			this.result[now - 1].tag = this.H2;
			return null;
		}

		// 문자열(result.child)이 HR인지 확인
		line = result.child.match(this.regExpHR);
		if(line != null) {
			result.tag   = this.HR;
			result.child = "";
			return result;
		}

		// 문자열(result.child)이 UL인지 확인
		line = result.child.match(this.regExpUL);
		if(line != null) {
			var r = this.isThisReallyListElement(this.UL, line, result);
			if(r !== false) {
				return r;
			} else {
				line = result.child.match(this.regExpCodeblock);
				return this.getCodeblockResult(line, result);
			}
		}

		// 문자열(result.child)이 OL인지 확인
		line = result.child.match(this.regExpOL);
		if(line != null) {
			var r = this.isThisReallyListElement(this.OL, line, result);
			if(r !== false) {
				return r;
			} else {
				line = result.child.match(this.regExpCodeblock);
				return this.getCodeblockResult(line, result);
			}
		}

		// 문자열(result.child)이 빈줄인지 확인
		line = result.child.match(this.regExpBlank);
		if(line != null) {
			result.tag   = this.BLANK;
			result.child = "";
			return result;
		}

		// 목록 요소에서 이어지는 문단인지 확인
		// 다른 곳은 모두 result.child로 매칭을 확인하지만
		// 여기서만큼은 string인 것을 유의하자.
		isContinuedList = this.matchContinuedList(string, now);
		if(isContinuedList != false) {
			return isContinuedList;
		}

		// 문자열(result.child)이 헤딩(h1, h2, h3, h4, h5, h6)인지 확인
		line = result.child.match(this.regExpHeading);
		if(line != null) {
			var headingLevel = line[1].length;

			switch(headingLevel) {
				case 1: result.tag = this.H1; break;
				case 2: result.tag = this.H2; break;
				case 3: result.tag = this.H3; break;
				case 4: result.tag = this.H4; break;
				case 5: result.tag = this.H5; break;
				case 6: result.tag = this.H6; break;
			}

			result.child = line[2];
			return result;
		}

		// 문자열(result.child)이 참조 문자열인지 확인
		// 스타일이 두 가지이기 때문에 두 가지 다 확인
		line = result.child.match(this.regExpReferencedId[0]);
		if(line == null) {
			line = result.child.match(this.regExpReferencedId[1]);
		}
		if(line != null) {
			this.refId[line[1]] = new RICALE.HMD.ReferencedId(line[2], line[4]);
			return null;
		}

		// 문자열(result.child)이 코드블록인지 확인
		line = result.child.match(this.regExpCodeblock);
		if(line != null) {
			return this.getCodeblockResult(line, result);
		}

		// 위의 어떠한 요소와도 매치되지 않는다면
		// 문단 요소로 판단한다.		
		result.tag = this.P;
		result.child = result.child;
		return result;

	}, // end function match

	// UL/OL의 정규 표현식과 일치한 결과(line)가
	// a. 진짜 UL/OL인지,
	// b. UL/OL과 비슷한 형식을 취하고 있는 CODEBLOCK인지
	// 확인한다.
	// a의 경우 정확히 무엇인지(UL/OL) 결과 값을 반환하고
	// b의 경우 false를 반환한다.
	isThisReallyListElement: function(tag, line, result) {
		var r = this.getListLevel(line[1]);

		if(r.tag != this.CODEBLOCK) {
			result.tag   = r.tag != null ? r.tag : tag;
			result.level = r.level;
			result.child = line[2];
			return result;

		} else {
			return false;
		}
	},

	// CODEBLOCK의 정규 표현식과 일치한 결과(line)를
	// 사용하기 적절한 결과 값으로 변환해 반환한다.
	getCodeblockResult: function(line, result) {
		result.tag   = this.CODEBLOCK;
		result.child = line[2];
		return result;
	},

	// 문자열(string)이 목록 요소로부터 늘어진 문단 요소인지 확인한다.
	// this.match에서밖에 쓰이지 않기 때문에 따로 함수로 작성할 필요는 없지만
	// 의미론적으로 분리하기 위해 별도의 함수를 만든다.
	// now는 이 문자열의 줄번호이다.
	matchContinuedList: function(string, now) {
		var result = new RICALE.HMD.TranslateSentence(),

		    // 빈 줄을 제외하고, 바로 윗 줄에 대한 정보를 얻는다.
		    above = this.aboveExceptBlank(now),
		    // 빈 줄을 포함한 바로 윗 줄에 대한 정보를 얻는다.
		    prev = this.previousLine(now),
		    // 목록 요소 내부의 문단 요소로써 문법적으로 적절한지 체크한다.
		    line = string.match(this.regExpContinuedList);

		// 1. 빈 줄을 포함한 윗 줄이 존재하는 가운데,
		// 2. 그 윗줄의 목록 요소 레벨이 0이 아니라면(=목록 요소 내부의 문단요소라면)
		// 이 줄 또한 목로 요소 내부의 문단 요소이다.
		if(prev != null && prev.level != 0) {

			result.tag = this.P;
			result.child = string;
			result.level = this.listLevel.length;

			return result;

		// 1. 빈 줄을 제외한 윗 줄이 존재하고,
		// 2. 그 줄의 목록 요소 레벨이 0이 아니고
		// 3. 목록 내부의 문단 요소로써 문법도 일치한다면
		// 이것은
		//   a. 목록 요소 내부의 코드 블록이거나
		//   b. 목록 요소 내부의 문단 요소이다.
		} else if(above != null && above.level != 0 && line !== null) {

			// 위 주석에서의 a인 경우.
			// 판단 기준은 들여쓰기.
		   	if(this.getIndentLevel(line[1]) == 8) {
		   		if((this.listLevel.length - 1) * 4 <= this.getIndentLevel(line[2])) {
		   			result.tag = this.CODEBLOCK;
					result.child = line[2].slice((this.listLevel.length - 1) * 4) + line[3];
					result.level = this.listLevel.length;

					return result;
		   		}
		   	}

//		   	var bq = line[3].match(this.regExpBlockquote);
//		   	if(bq != null) {
//		   		result.tag = this.BLOCKQUOTE;
//		   		result.child = this.match(line[3]);
//		   		result.level = this.listLevel.length;
//
//		   		return result;
//		   	}

	   		result.tag = this.P;
	   		result.child = line[3];
			result.level = this.listLevel.length;

			return result;
		}

		// 위의 어떠한 사항에도 해당하지 않는다면 이 줄은 목록 요소 내부의 블록 요소가 아니다.
		return false;
	},

	// 이 줄(string)이 인용 요소에 포함된 줄인지,
	// 포함되어 있다면 인용 요소가 몇 번이나 중첩되어 있는지 체크한다.
	matchBlockquotes: function(string, now) {
		var result = new RICALE.HMD.TranslateSentence(),
		    line = null;

		result.child = string;

		// 인용 문법에 포함되는지, 몇 번이나 중첩되는지 체크한다.
		while(true) {
			line = result.child.match(this.regExpBlockquote);
			if(line == null) {
				return result;
			}

			result.quote += line[1].length;
			result.child = line[2];
		}
	},

	// 공백(blank)이 몇 개의 공백(space)인지 확인한다.
	// 탭 문자는 4개의 공백으로 계산한다.
	getIndentLevel: function(blank) {
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

		return space;
	},

	// 목록 요소의 레벨을 이 줄의 들여쓰기(blank)를 통해 얻는다.
	// 목록 요소와 유사한 형태의 CODEBLOCK이라면 해당 결과를 반환한다.
	getListLevel: function(blank) {
		// 이 줄의 들여쓰기가 몇 탭(tab) 몇 공백(space)인지 확인한다.
		var space = this.getIndentLevel(blank),
		    result = new RICALE.HMD.TranslateSentence();

		// 현재 목록 레벨이 이어지지 않던 상황에서
		// a. 공백이 3 이하라면 목록의 레벨은 1이 된다.
		// b. 공백이 3 초과라면 이 줄은 목록 요소가 아니라 코드블록 요소이다.
		if(this.listLevel.length == 0) {
			if(space <= 3) {
				this.listLevel[0] = space;

				result.level = 1;
				return result;

			} else {
				result.tag = this.CODEBLOCK;
				return result;
			}

		// 현재 목록 레벨이 1만 존재하는 상황에서
		// a. 목록 레벨 1과 들여쓰기가 같다면 이 줄은 레벨 1이 된다.
		// b. 목록 레벨 1과 들여쓰기가 틀리고 공백이 7 이하라면 레벨 2가 된다.
		// c. 공백이 7 초과라면 이 줄은 목록 요소가 아니라 코드블록 요소이다.
		} else if (this.listLevel.length == 1) {
			if(space == this.listLevel[0]) {
				result.level = 1;
				return result;

			} else if(space <= 7) {
				this.listLevel[1] = space;

				result.level = 2;
				return result;

			} else {
				result.tag = this.CODEBLOCK;
				return result;
			}

		// 현재 목록 레벨이 2 이상 존재하는 상황에서
		// a. 공백이 일정 수치 이상이면 이 줄은 목록 요소가 아니라 목록 요소 내부의 문단 요소가 된다.
		// b. a에 해당하지 않고, 공백이 바로 전 레벨보다 크고 일정 수치보다 크면 이 줄은 이전 레벨 + 1이다.
		// c. a,b,에 해당하지 않고, 공백이 바로 전 레벨과 같거나 크면 이 줄은 이전 레벨이 된다.
		// d. a,b,c,에 해당하지 않고, 공백이 전 레벨들 중 어떤 하나보다 수치가 크거나 같으면 해당 레벨이다.
		// e. 이도 저도 아니면 이 줄은 목록 요소가 아니라 목록 요소 내부의 문단 요소가 된다.
		} else {
			var now = this.listLevel.length;

			if(space >= (now + 1) * 4) {
				result.tag = this.P;
				result.level = now;
				return result;

			} else if(space > this.listLevel[now - 1] && space > (now - 1) * 4) {
				this.listLevel[now] = space;

				result.level = now + 1;
				return result;

			} else if(space >= this.listLevel[now - 1]) {
				result.level = now;
				return result;

			} else {
				for(var i = now - 2; i >= 0 ; i--) {
					if(space >= this.listLevel[i]) {
						this.listLevel = this.listLevel.slice(0, i + 1);

						result.level = i + 1;
						return result;
					}
				}

				result.tag = this.P;
				result.level = now;
				return result;
			}
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
	previousLine: function(index) {
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

	idxBelowThisList: function(index) {
		for(var i = index + 1; i < this.result.length; i++) {
			if(this.result[i].level == 0) {
				return i;
			} else if(this.result[i].tag == this.UL || this.result[i].tag == this.OL) {
				return null;
			}
		}

		return null;
	},

	idxAboveThisList: function(index) {
		for(var i = index - 1; i >= 0; i--) {
			if(this.result[i].level == 0) {
				return i;
			} else if(this.result[i].tag == this.UL || this.result[i].tag == this.OL) {
				return null;
			}
		}

		return null;
	},

	// 블록 요소에 대한 해석이 끝난 줄의 본문(string)의 인라인 요소들을 찾아 바로 번역한다.
	// 아무런 인라인 요소도 포함하고 있지 않다면 인자를 그대로 반환한다.
	decodeInline: function(string) {
		// 문자열 내에 strong 요소가 있는지 확인하고 번역
		for(var i = 0; i < this.regExpStrong.length; i++) {
			string = string.replace(this.regExpStrong[i], '<strong>$1</strong>');
		}
		
		// 문자열 내에 em 요소가 있는지 확인하고 번역
		for(var i = 0; i < this.regExpEM.length; i++) {
			string = string.replace(this.regExpEM[i], '<em>$1</em>');
		}

		// 문자열 내에 code 요소가 있는지 확인하고 번역
		for(var i = 0; i < this.regExpCode.length; i++) {
			string = string.replace(this.regExpCode[i], '<code>$1</code>');
		}

		// 문자열 내에 img 요소가 있는지 확인하고 번역
		// 단 전체 내용 내에 대응대는 참조 스타일의 url이 없다면 번역되지 않는다.
		while(true) {
			var line = string.match(this.regExpImg);

			if(line == null) {
				break;
			}

			var id = line[2] == "" ? line[1] : line[2];
			if(this.refId[id] == undefined){
				break;
			}

			if(this.refId[id]['title'] != null) {
				string = string.replace(this.regExpImg, '<img src="' + this.refId[id]['url'] + '" alt="' + line[1]
					                    + '" title="' + this.refId[id]['title'] + '">');
			} else {
				string = string.replace(this.regExpImg, '<img src="' + this.refId[id]['url'] + '" alt="' + line[1] + '">');
			}
		}

		// 문자열 내에 a 요소가 있는지 확인하고 번역
		// 단 전체 내용 내에 대응대는 참조 스타일의 url이 없다면 번역되지 않는다.
		while(true) {
			var line = string.match(this.regExpLink);

			if(line == null) {
				break;
			}
			
			var id = line[2] == "" ? line[1] : line[2];
			if(this.refId[id] == undefined) {
				break;
			}

			if(this.refId[id]['title'] != null) {
				string = string.replace(this.regExpLink, '<a href="' + this.refId[id]['url'] + '" title="' + this.refId[id]['title'] + '">'
				                        + line[1] + '</a>');
			} else {
				string = string.replace(this.regExpLink, '<a href="' + this.refId[id]['url'] + '">' + line[1] + '</a>');
			}
		}

		// 인라인 스타일의 img 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpImgInline[0], '<img src="$2" alt="$1" title="$3">');
		string = string.replace(this.regExpImgInline[1], '<img src="$2" alt="$1">');

		// 인라인 스타일의 a 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpLinkInline[0], '<a href="$2" alt="$3">$1</a>');
		string = string.replace(this.regExpLinkInline[1], '<a href="$2">$1</a>');

		// url 스타일의 a 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpLinkAuto, '<a href="$1">$1</a>');

		// br 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpBreak, '<br/>');

		return string;
	},

	// 해석한 줄들을 전체적으로 확인해 번역한다.
	// this.translate에서 바로 하지 않는 이유는
	// 전후 줄의 상태에 따라 번역이 달라질 수 있기 때문이다.
	decode: function() {
		var string = "",
			// ul이 이어지던 상태였는가. 상태라면 레벨은 몇이었는가.
		    beginLI = false,
		    // p가 이어지던 상태였는가.
		    beginP = false,
		    // 코드블록이 이어지던 상태였는가.
		    beginCODEBLOCK = false,
		    // 인용이 이어지던 상태였는가.
		    blockquoteLevel = 0,
		    listElements = Array();

		// 줄 단위로 확인한다.
		for(var i = 0; i < this.result.length; i++) {
			var line = "";
			    r = this.result[i],
			    above = this.aboveExceptBlank(i),
			    prev = this.previousLine(i),
			    below = this.belowExceptBlank(i),
			    next = this.nextLine(i);

			// 코드블록이라면 내부의 인라인 요소를 번역할 필요가 없다.
			if(r.tag != this.CODEBLOCK) {
				r.child = this.decodeInline(r.child);
			}

			// 인용이 있고 이전 줄의 인용보다 레벨이 높다면
			// 높은 레벨 만큼 <blockquote> 태그 추가
			if(r.quote > 0 && r.quote > blockquoteLevel) {
				for(var j = 0; j < r.quote - blockquoteLevel; j++) {
					line += "<blockquote>";
				}

				blockquoteLevel = r.quote;
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
				case this.OL:
					// 목록 레벨이 이전보다 높아졌다면 높아진 만큼 <ol> 혹은 <ul> 추가
					if(listElements.length < r.level) {
						for(var j = listElements.length; j < r.level; j++) {
							listElements[j] = r.tag;
							line += listElements[j] == this.UL ? "<ul>" : "<ol>";
						}
					}

					line += "<li>";
					beginLI = true;

					var idxAboveList = this.idxAboveThisList(i),
					    idxBelowList = this.idxBelowThisList(i);

					if((idxBelowList != null && this.result[idxBelowList].tag == this.BLANK	&& idxBelowList + 1 < this.result.length
					                         && this.result[idxBelowList + 1].level == r.level)
						|| (idxAboveList != null && this.result[idxAboveList].tag == this.BLANK && idxAboveList - 1 >= 0
						                         && this.result[idxAboveList - 1].level == r.level)) {

						line += "<p>" + r.child;
						beginP = true;

						if(next == null || next.tag != this.P) {
							line += "</p>";
							beginP = false;
						}

					} else {
						line += r.child;
					}

					break;

				case this.CODEBLOCK:
					// 코드블록이 시작하지 않은 가운데 코드블록 요소가 나왔다면 <pre><code> 추가
					if(!beginCODEBLOCK) {
						line += "<pre><code>";
						beginCODEBLOCK = true;
					}

					line += r.child;

					if((r.level == 0 && (below == null || below.tag != this.CODEBLOCK || below.quote > r.quote))
						|| (r.level != 00 && (next == null || next.tag != this.CODEBLOCK))) {
						line += "</code></pre>"
						beginCODEBLOCK = false;
					}

					break;

				case this.P:
					// 문단이 시작하지 않은 가운데 목록 요소가 나왔다면 <p> 추가
					if(!beginP && !beginLI) {
						line += "<p>";
						beginP = true;
					}

					line += r.child;

					if(beginP) {
						if((r.level == 0 && (next == null || next.tag != this.P || below.quote > r.quote))
							|| (r.level != 0 && (next == null || next.tag != this.P))) {
							line += "</p>";
							beginP = false;
						}
					}
					break;

				default:
					line += r.child;
					break;
			}

			if(beginLI) {

				// a. 공백을 제외한 다음 줄이 존재하지 않거나
				// b. 공백을 제외한 다음 줄의 목록 요소 레벨이 0이거나
				// c. 공백을 제외한 다음 줄이 UL 혹은 OL 이라면
				// </li> 추가
				if(below == null || below.level == 0 || (below.tag == this.UL || below.tag == this.OL)) {
					line += "</li>";
					beginLI = false;

					// 목록 레벨이 이전보다 낮아졌다면 낮아진 만큼 </ul> 추가
					var level = below != null ? below.level : 0;
					if(listElements.length > level) {
						for(var j = listElements.length - 1; j >= level; j--) {
							line += listElements[j] == this.UL ? "</ul>" : "</ol>";
						}
						listElements = listElements.slice(0, level);
					}
				}
			}

			// a. 빈 줄을 제외한 아래 줄이 없거나 (마지막 줄이거나)
			// b. 1. 빈 줄을 제외한 아래 줄이 이 줄 인용보다 레벨이 낮고 
			//    2. 빈 줄을 포함한 바로 아래 줄이 빈 줄이며 인용 레벨이 0이라면
			// </blockquote> 태그를 추가한다.
			if(below == null || (below.quote < blockquoteLevel && (next.tag == this.BLANK && next.quote == 0))) {
				var quote = below != null ? below.quote : 0
				for(var j = 0; j < blockquoteLevel - quote; j++) {
					line += "</blockquote>";
				}

				blockquoteLevel = quote;
			}

			string += line;
			console.log(line);
		}

		this.target.html(string);
	}
} // RICALE.HMD.Decoder.prototype

// 사용 예제 코드

$(document).ready(function() {
	RICALE.decoder = new RICALE.HMD.Decoder($('#target'));
	$('#source').click(function() {
		RICALE.decoder.translate($('#source').val());
	});
});