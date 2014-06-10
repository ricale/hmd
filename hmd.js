// # handmade markdown decoder (hmd)
//  - written by ricale
//  - version 0.2.3.1
//  - ricale@ricalest.net

if (!Array.prototype.last) {
    Array.prototype.last = function(){
        return this[this.length - 1];
    };
};

// # 사용법
// - hmd.run(sourceTextareaSelector, targetElementSelector)
// - hmd.decode(string)
//
// 상세 정보는 git 저장소(https://bitbucket.org/ricale/hmd) 참고

hmd = (function() {

    var self, listLevel, listLevelInBlockquote, analyzedSentences,
        escapeRule, inlineRule, AnalyzedSentence,
        translate,
        matching,
        matchBlockquotes,
        getIndentLevel,
        aboveExceptBlank,
        belowExceptBlank,
        previousLine,
        nextLine,
        idxBelowThisList,
        idxAboveThisList,
        decodeInline,
        replaceForCodeblock,
        decode,

    //
    // # private constants
    //////////////////////

    // 어떤 마크다운 문법이 적용되었는지 구분할 때 쓰일 구분자들 (string) 
    P = "p",
    H1 = "h1",
    H2 = "h2",
    H3 = "h3",
    H4 = "h4",
    H5 = "h5",
    H6 = "h6",
    HR = "hr",
    UL = "ul",
    OL = "ol",
    BLANK = "blank",
    CODEBLOCK = "codeblock",
    BLOCKQUOTE = "blockquote",

    // ## 블록 요소 마크다운의 정규 표현식들

    // 반드시 지켜져야 할 해석 순서
    // Blockquote > Heading Underlined > HR > (UL, OL, ContinuedList) > (Codeblock, Heading, ReferencedId)
    // Blank > Codeblock

    regExpBlockquote = /^[ ]{0,3}(>+)[ ]?([ ]*.*)$/,
    regExpH1Underlined = /^=+$/,
    regExpH2Underlined = /^-+$/,
    regExpHR = /^[ ]{0,3}([-_*][ ]*){3,}$/,
    regExpUL = /^([\s]*)[*+-][ ]+(.*)$/,
    regExpOL = /^([\s]*)[\d]+\.[ ]+(.*)$/,
    regExpBlank = /^[\s]*$/,
    regExpContinuedList = /^([ ]{1,8})([\s]*)(.*)/,
    regExpCodeblock = /^([ ]{0,3}\t|[ ]{4})([\s]*.*)$/,
    regExpHeading = /^(#{1,6}) (.*[^#])(#*)$/,
    regExpReferencedId = [
        /^[ ]{0,3}\[([^\]]+)\]:[\s]*<([^\s>]+)>[\s]*(?:['"(](.*)["')])?$/,
        /^[ ]{0,3}\[([^\]]+)\]:[\s]*([^\s]+)[\s]*(?:['"(](.*)["')])?$/
    ];


    //
    // # private objects
    //////////////////////

    escapeRule = (function() {
        var regexp = /\\([\\\-\*\.\[\]\(\)_+<>#`^])/g,
            returnRegexp = /;;ESCAPE([0-9]+);;/g,
            replacee = ['-', '_', '*', '+', '.', '<',    '>',    '#', '[', ']',  '(',  ')',  '`',  '\\',  '^'],
            result   = ['-', '_', '*', '+', '.', '&lt;', '&gt;', '#', '[', ']',  '(',  ')',  '`',  '\\',  '^'],
            replacer = {};

        for(idx in replacee) {
            replacer[replacee[idx]] = ';;ESCAPE' + idx + ';;';
        }

        return (function() {
            return {
                decode: function(string) {
                    string = string.replace(regexp, function(match, p1) {
                        return replacer[p1];
                    })

                    return string
                },

                escape: function(string) {
                    string = string.replace(returnRegexp, function(match, p1) {
                        return result[p1];
                    });

                    return string
                }
            }
        })()
    })();

    inlineRule = (function() {
        var NORMAL = 0,
            NEED_REPLACER = 1,
            REFERENCED = 2,

            replacees = Array(),
            replacerRegexp = /;;REPLACER([0-9]+);;/g,
            reference = {},
            rules,

        getReference = function(url, title) {
            return { url: url, title: title }
        },

        getRule = function(regexp, type, result, notReplaced) {
            return {
                regexp: regexp,
                type:   type,
                result: result, // or replacee
                notReplaced: notReplaced || null,
            }
        },

        replacer = function() {
            return ';;REPLACER' + (replacees.length - 1) + ';;'
        };


        // 반드시 지켜져야 할 해석 순서
        // - Strong > EM
        // - Img > Link
        // - ImgInline > LineInline
        rules = [
            getRule(/!\[([^\]]+)\][\s]*\[([^\]]*)\]/g,
                    REFERENCED,
                    function(url,alt,title) { return '<img src="'+url+'" alt="'+alt+'"'+(title!=undefined ? ' title="'+title+'"' : '')+'>' }),

            getRule(/\[([^\]]+)\][\s]*\[([^\]]*)\]/g,
                    REFERENCED,
                    function(url,alt,title) { return '<a href="'+url+'"'+(title!=undefined ? ' title="'+title+'"' : '')+'>' },
                    function(text) { return text + '</a>' }),

            getRule(/``[\s]*(.+?)[\s]*``/g,                          NEED_REPLACER, function(p1) { return '<code>'+p1.replace(/</g,'&lt;')+'</code>' }),
            getRule(/`([^`]+)`/g,                                    NEED_REPLACER, function(p1) { return '<code>'+p1.replace(/</g,'&lt;')+'</code>' }),
            getRule(/!\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g, NEED_REPLACER, function(p1,p2,p3) { return '<img src="$2" alt="$1" title="$3">' }),
            getRule(/\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,  NEED_REPLACER, function(p1,p2,p3) { return '<a href="'+p2+'"'+(p3!=undefined ? ' title="'+p3+'"' : '')+'>' }, function(p1) { return p1+'</a>' }),
            getRule(/<(http[s]?:\/\/[^<]+)>/g,                       NEED_REPLACER, function(p1) { return '<a href="'+p1+'">'+p1+'</a>'}),

            getRule(/\*\*([^\*\s]{1,2}|\*[^\*\s]|[^\*\s]\*|(?:[^\s].+?[^\s]))\*\*/g, NORMAL, '<strong>$1</strong>'),
            getRule(/__([^_\s]{1,2}|_[^_\s]|[^_\s]_|(?:[^\s].+?[^\s]))__/g,          NORMAL, '<strong>$1</strong>'),
            getRule(/\*([^\*\s]{1,2}|[^\s].+?[^\s])\*/g,                             NORMAL, '<em>$1</em>'),
            getRule(/_([^_\s]{1,2}|[^\s].+?[^\s])_/g,                                NORMAL, '<em>$1</em>'),
            getRule(/(  )$/,                                                         NORMAL, '<br/>'),
            getRule(/<(?=[^>]*$)/g,                                                  NORMAL, '&lt;')
        ];

        return (function() {
            return {
                init: function() {
                    replacees = Array();
                    reference = {};
                },

                addRule: function(ruleArray) {
                    var i;

                    for(i in ruleArray) {
                        rules[rules.length] = getRule(ruleArray[i][0], NORMAL, ruleArray[i][1]);
                    }
                },

                addReference: function(id, url, title) {
                    reference[id] = getReference(url, title);
                },

                decode: function(string) {
                    var idx, rule, index, line, ref;

                    for(idx in rules) {
                        rule = rules[idx]

                        switch(rule.type) {
                        case NORMAL:
                            string = string.replace(rule.regexp, rule.result);
                            break;

                        case NEED_REPLACER:
                            string = string.replace(rule.regexp, function(match, p1, p2, p3) {
                                replacees[replacees.length] = rule.result(p1, p2, p3);
                                return replacer() + (rule.notReplaced != null ? rule.notReplaced(p1) : '');
                            })
                            break;

                        case REFERENCED:
                            string = string.replace(rule.regexp, function(match, p1, p2) {
                                ref = reference[p2 || p1];
                                if(ref == undefined) return match

                                replacees[replacees.length] = rule.result(ref['url'], p1, ref['title'])
                                return replacer() + (rule.notReplaced != null ? rule.notReplaced(p1) : '');
                            })
                            break;
                        }
                    }

                    return string;
                },

                escape: function(string) {
                    string = string.replace(replacerRegexp, function(match, p1) {
                        return replacees[p1]
                    })

                    replacees = Array();

                    return string;
                }
            }
        })();
    })();

    stackedBlockElements = (function() {
        var elements = Array(),
            currentQuoteLevel = 0,
            currentListLevel = 0,
            paragraphNow = false;

        return (function() {
            return {
                init: function() {
                    elements = Array();
                    currentQuoteLevel = 0;
                    currentListLevel = 0;
                    paragraphNow = false;
                },

                push: function(tag, level) {
                    level = level == undefined ? 0 : level

                    if(tag == BLOCKQUOTE) {
                        currentQuoteLevel += 1;
                    } else if(tag == UL || tag == OL) {
                        currentListLevel = level;
                    } else {
                        paragraphNow = true;
                    }

                    elements.push({
                        'tag':   tag,
                        'level': level
                    })

                    switch(tag)
                    {
                    case BLOCKQUOTE: return "<blockquote>"
                    case UL:         return "<ul><li>"
                    case OL:         return "<ol><li>"
                    }
                },

                pop: function() {
                    var i, element;

                    if(elements.length > 0) {
                        if(elements.last().tag == BLOCKQUOTE) {
                            currentQuoteLevel -= 1;
                        } else {
                            currentListLevel = 0;
                            for(i = elements.length - 2; i >= 0; i--) {
                                if(elements[i].tag != BLOCKQUOTE) {
                                    currentListLevel = elements[i].level;
                                    break;
                                }
                            }
                        }
                    }

                    element = elements.pop();

                    switch(element.tag)
                    {
                    case BLOCKQUOTE: return "</blockquote>"
                    case UL:         return "</li></ul>"
                    case OL:         return "</li></ol>"
                    }
                },

                last: function() {
                    return elements.last();
                },

                listLevel: function() {
                    return currentListLevel;
                },

                quoteLevel: function() {
                    return currentQuoteLevel;
                },

                lastIsBlockquote: function() {
                    var last = elements.last();
                    return last && last.tag == BLOCKQUOTE
                },

                lastIsNotBlockquote: function() {
                    var last = elements.last();
                    return last && last.tag != BLOCKQUOTE
                },

                size: function() {
                    return elements.length;
                },

                stack: function() {
                    return elements;
                }
            }
        })()
    })();

    // # private inner classes
    ////////////////////

    AnalyzedSentence = function() {
        // 이 문장의 실제 내용 (string)
        this.content = null;
        // 이 문장에 적용될 HTML의 블록요소를 구분하기 위한 구분자 (string)
        this.tag = null;
        // 이 문장의 목록 요소 중첩 정도 (integer)
        this.level = 0;
        // 이 문장의 인용 블록 요소 중첩 정도 (integer)
        this.quote = 0;
    };

    AnalyzedSentence.prototype = {
        isParagraph: function() {
            return this.tag == P
        },

        isUnorderedList: function() {
            return this.tag == UL
        },

        isOrderedList: function() {
            return this.tag == OL
        },

        isList: function() {
            return this.isUnorderedList() || this.isOrderedList();
        },

        isBlank: function() {
            return this.tag == BLANK
        },

        isCodeblock: function() {
            return this.tag == CODEBLOCK
        },

        isNotParagraph: function() {
            return this.tag != P
        },

        isNotUnorderedList: function() {
            return this.tag != UL
        },

        isNotOrderedList: function() {
            return this.tag != OL
        },

        isNotList: function() {
            return this.isNotUnorderedList() && this.isNotOrderedList();
        },

        isNotBlank: function() {
            return this.tag != BLANK
        },

        isNotCodeblock: function() {
            return this.tag != CODEBLOCK
        }
    }

    // # private methods
    ////////////////////

    translate = function(sourceString) {
        var array = sourceString.split(/\n/), i, now, r,

        initAll = function() {
            inlineRule.init();

            analyzedSentences = Array();
            listLevel = Array();
            listLevelInBlockquote = Array();

            stackedBlockElements.init();
        },

        isEndOfList = function(result) {
            return result.isNotBlank() && result.level == 0
        },

        cleanListInformation = function() {
            if(listLevel.length > 0) {
                listLevel = Array();
                listLevelInBlockquote = Array();
            }

            if(listLevelInBlockquote.length > 0) {
                listLevelInBlockquote = Array();
            }
        };

        self = this;

        initAll();

        now = 0
        for(i = 0; i < array.length; i++) {
            if((r = matching(array[i], now)) == null) {
                continue;
            }

            analyzedSentences[now] = r;

            if(isEndOfList(analyzedSentences[now])) {
                cleanListInformation()
            }

            console.log(analyzedSentences[now]);
            now++;
        }

        return decode();
    };

    
    matching = function(string, now) {
        var sentence = matchBlockquotes(string), line = null, result,

        isBlank = function() {
            return sentence.content.match(regExpBlank) != null;
        },

        isUnderlineForH1 = function() {
            return sentence.content.match(regExpH1Underlined) != null && now != 0 && analyzedSentences[now - 1].isParagraph()
        },

        isUnderlineForH2 = function() {
            return sentence.content.match(regExpH2Underlined) != null && now != 0 && analyzedSentences[now - 1].isParagraph()
        },

        isHR = function() {
            return sentence.content.match(regExpHR) != null
        },

        matchWithListForm = function(tag, regExpTag) {

            var line, isLine,

            isThisReallyListElement = function(line) {

                var getListLevel = function(blank, isInBq) {
                    // 이 줄의 들여쓰기가 몇 개의 공백으로 이루어져있는지 확인한다.
                    var space = getIndentLevel(blank),
                        result = new AnalyzedSentence(),
                        levels = isInBq ? listLevelInBlockquote : listLevel,
                        now, exist, i,

                    noListBefore                         = function() { return levels.length == 0; },
                    existListWithOnlyOneLevel            = function() { return levels.length == 1; },
                    indentIsSameAsFirstLevelOfList       = function() { return space == levels[0]; },
                    isParagraphContinuedFromPrevListItem = function() { return space >= (now + 1) * 4; },
                    isNextLevelOfPrevListItem            = function() { return space > levels[now - 1] && space > (now - 1) * 4 },
                    isSameLevelOfPrevListItem            = function() { return space >= levels[now - 1]; };

                    if(noListBefore()) {
                        if(space <= 3) {
                            levels[0] = space;
                            result.level = 1;

                        } else {
                            result.tag = CODEBLOCK;
                        }


                    } else if(existListWithOnlyOneLevel()) {
                        if(indentIsSameAsFirstLevelOfList()) {
                            result.level = 1;

                        } else if(space <= 7) {
                            levels[1] = space;
                            result.level = 2;

                        } else {
                            result.tag = CODEBLOCK;
                        }

                    } else {
                        now = levels.length;

                        if(isParagraphContinuedFromPrevListItem()) {
                            result.tag = P;
                            result.level = now;

                        } else if(isNextLevelOfPrevListItem()) {
                            levels[now] = space;

                            result.level = now + 1;

                        } else if(isSameLevelOfPrevListItem()) {
                            result.level = now;

                        } else {
                            exist = false;
                            for(i = now - 2; i >= 0 ; i--) {
                                if(space >= levels[i]) {
                                    levels = levels.slice(0, i + 1);

                                    result.level = i + 1;
                                    exist = true;
                                    break;
                                }
                            }

                            if(!exist) {
                                result.tag = P;
                                result.level = now;
                            }
                        }
                    }

                    if(isInBq) {
                        result.level += listLevel.length;
                        listLevelInBlockquote = levels;
                        
                    } else {
                        listLevel = levels;
                    }

                    levels = null;

                    return result;
                }; // getListLevel

                r = getListLevel(line[1], sentence.quote != 0);

                if(r.isNotCodeblock()) {
                    sentence.tag   = r.tag != null ? r.tag : tag;
                    sentence.level = r.level;
                    sentence.content = line[2];
                    return sentence;

                } else {
                    return false;
                }
            }; // isThisReallyListElement


            if((line = sentence.content.match(regExpTag))) {
                if((isLine = isThisReallyListElement(line)) !== false) {
                    return isLine;

                } else {
                    return matchCodeblock(sentence);
                }
            }

            return null;
        },

        matchWithULForm = function() {
            return matchWithListForm(UL, regExpUL, sentence)
            
        },

        matchWithOLForm = function() {
            return matchWithListForm(OL, regExpOL, sentence)
        },

        matchContinuedList = function(string, now, last) {
            var previousLineIsList = function() { // 바로 윗 줄이 리스트인가
                return prev != null && prev.level != 0
            },

            isCodeblock = function() {
                return line != null && prev.isCodeblock() && getIndentLevel(line[1]) == 8 && (prev.level - 1) * 4 <= getIndentLevel(line[2])
            },

            listIsContinuedNow = function() { // 공백이 아닌 문장 중 가장 최근의 문장이 리스트인가
                return above != null && above.level != 0
            },

            result = new AnalyzedSentence(),
            above = aboveExceptBlank(now),
            prev = previousLine(now),
            line = string.match(regExpContinuedList),
            indent;


            if(previousLineIsList()) {

                if(isCodeblock()) {
                    result.tag = CODEBLOCK;
                    result.content = line[2].slice((prev.level - 1) * 4) + line[3];
                    result.level = prev.level;
                    result.quote = last.quote;

                    return result;
                }

                result = matchBlockquotes(string);
                result.tag = P;
                result.level = prev.level;

                return result;

                // 1. 빈 줄을 제외한 바로 윗 줄이 존재하고,
                // 2. 그 줄의 목록 요소 레벨이 0이 아니고
                // (=> 바로 윗 줄은 공백이 최소 한 줄 있으며, 그 공백들 바로 위의 문장은 목록 요소가 이어지는 중이었다면)
                // 3. 또, 목록 내부의 문단 요소로써 문법도 일치한다면
                // 이것은
                //   a. 목록 요소 내부의 코드 블록이거나
                //   b. 목록 요소 내부의 인용 블록이거나
                //   c. 목록 요소 내부의 문단 요소이다.
            } else if(listIsContinuedNow()) {

                if(line == null) {
                    result = matchBlockquotes(string);
                    if(result.quote == above.quote) {
                        line = result.content.match(regExpContinuedList);

                        if(line == null) {
                            return null;
                        }
                    } else {
                        return null;
                    }
                }

                // a
                if(getIndentLevel(line[1]) == 8) {
                    if((above.level - 1) * 4 <= getIndentLevel(line[2])) {
                        result.tag = CODEBLOCK;
                        result.content = line[2].slice((above.level - 1) * 4) + line[3];
                        result.level = above.level;
                        result.quote = last.quote;

                        return result;
                    }
                }

                // b 혹은 c
                result = matching(line[3]);
                indent = getIndentLevel(line[1] + line[2]);
                indent = indent / 4 - indent / 4 % 1 + (indent % 4 != 0);

                result.level += indent > above.level ? above.level : indent;
                result.quote = above.quote;

                return result;
            }

            // 위의 어떠한 사항에도 해당하지 않는다면 이 줄은 목록 요소 내부의 블록 요소가 아니다.
            return null;
        },

        // CODEBLOCK의 정규 표현식과 일치한 결과(line)를
        // 사용하기 적절한 결과 값으로 변환해 반환한다.
        getCodeblockResult = function(line) {
            sentence.tag     = CODEBLOCK;
            sentence.content = line[2];
            return sentence;
        },

        matchHeading = function() {
            var line, headingLevel;

            if((line = sentence.content.match(regExpHeading))) {
                headingLevel = line[1].length;

                switch(headingLevel) {
                    case 1: sentence.tag = H1; break;
                    case 2: sentence.tag = H2; break;
                    case 3: sentence.tag = H3; break;
                    case 4: sentence.tag = H4; break;
                    case 5: sentence.tag = H5; break;
                    case 6: sentence.tag = H6; break;
                }

                sentence.content = line[2];
                return sentence;
            }

            return null;
        },

        matchReference = function() {
            var line;

            if((line = sentence.content.match(regExpReferencedId[0])) == null) {
                line = sentence.content.match(regExpReferencedId[1]);

                return line;
            }

            return line;
        },

        matchCodeblock = function() {
            if((line = sentence.content.match(regExpCodeblock))) {
                sentence.tag     = CODEBLOCK;
                sentence.content = line[2];
                return sentence;
            }

            return null;
        },

        setBlankSentence = function() {
            sentence.tag     = BLANK;
            sentence.content = "";
            return sentence;
        },

        setPrevLineAsH1 = function() {
            analyzedSentences[now - 1].tag = H1;
            return null;
        },

        setPrevLineAsH2 = function() {
            analyzedSentences[now - 1].tag = H2;
            return null;
        },

        setHRSentence = function() {
            sentence.tag     = HR;
            sentence.content = "";
            return sentence;
        },

        setReference = function() {
            inlineRule.addReference(result[1], result[2], result[3])
            return null;
        },

        setParagraph = function() {
            sentence.tag = P;
            return sentence;
        };

        if(isBlank()) return setBlankSentence();

        if(isUnderlineForH1()) return setPrevLineAsH1(); // return null

        if(isUnderlineForH2()) return setPrevLineAsH2(); // return null

        if(isHR()) return setHRSentence();

        if((result = matchWithULForm())) return result;

        if((result = matchWithOLForm())) return result;

        if((result = matchContinuedList(string, now, sentence))) return result;

        if((result = matchHeading())) return result;

        if((result = matchReference())) return setReference(); // return null

        if((result = matchCodeblock())) return result;

        return setParagraph();

    }; // matching

    // 이 줄(string)이 인용 요소에 포함된 줄인지,
    // 포함되어 있다면 인용 요소가 몇 번이나 중첩되어 있는지 확인한다.
    // 인용 블록 요소 확인 결과가 담긴 AnalyzedSentence 객체를 반환한다.
    matchBlockquotes = function(string) {
        var result = new AnalyzedSentence(),
            line = null;

        result.content = string;

        while(true) {
            line = result.content.match(regExpBlockquote);

            if(line == null) return result;

            result.quote += line[1].length;
            result.content = line[2];
        }
    };

    // 들여쓰기(blank)가 몇 개의 공백(space)인지 확인해 결과를 반환한다.
    // 탭(tab) 문자는 4개의 공백으로 계산한다.
    getIndentLevel = function(blank) {
        var indent = blank.match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g),
            space = 0, i;

        if(indent != null) {
            for(i = 0; i < indent.length; i++) {
                if(indent[i].match(/^[ ]{1,3}$/) != null) {
                    space += indent[i].length;
                } else {
                    space += 4;
                }
            }
        }

        return space;
    };

    // 빈 줄을 제외한 바로 윗줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    aboveExceptBlank = function(index) {
        for(var i = index - 1; i >= 0; i--) {
            if(analyzedSentences[i].isNotBlank()) {
                return analyzedSentences[i];
            }
        }

        return null;
    };

    // 빈 줄을 제외한 바로 아랫줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    belowExceptBlank = function(index) {
        for(var i = index + 1; i < analyzedSentences.length; i++) {
            if(analyzedSentences[i].isNotBlank()) {
                return analyzedSentences[i];
            }
        }

        return null;
    };

    // 빈 줄을 포함한 바로 윗줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    previousLine = function(index) {
        return index > 1 ? analyzedSentences[index - 1] : null;
    };

    // 빈 줄을 포함한 바로 아랫줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    nextLine = function(index) {
        return index < analyzedSentences.length - 1 ? analyzedSentences[index + 1] : null;
    };

    // 현재 이어지고 있는 목록 요소가 끝나고 난 뒤의 줄 번호를 얻는다.
    idxBelowThisList = function(index) {
        for(var i = index + 1; i < analyzedSentences.length; i++) {
            if(analyzedSentences[i].level == 0) {
                return i + 1 < analyzedSentences.length ? i : null;

            } else if(analyzedSentences[i].isUnorderedList() || analyzedSentences[i].isOrderedList()) {
                return i != index + 1 ? i : null;
            }
        }

        return null;
    };

    // 현재 이어지고 있는 목록 요소가 시작하기 전의 줄 번호를 얻는다.
    idxAboveThisList = function(index) {
        for(var i = index - 1; i >= 0; i--) {
            if(analyzedSentences[i].level == 0) {
                return i - 1 >= 0 ? i : null;

            } else if(analyzedSentences[i].isUnorderedList() || analyzedSentences[i].isOrderedList()) {
                return i != index - 1 ? i : null;
            }
        }

        return null;
    };

    // 블록 요소에 대한 해석이 끝난 줄의 본문(string)의 인라인 문법들을 찾아 바로 번역한다.
    // 아무런 인라인 문법도 포함하고 있지 않다면 인자를 그대로 반환한다.
    // 추가적으로 사용자가 번역 함수를 추가했다면 해당 함수 또한 실행된다.
    decodeInline = function(string) {
        string = escapeRule.decode(string);
        string = inlineRule.decode(string);

        string = inlineRule.escape(string);
        string = escapeRule.escape(string);

        return string;
    };

    replaceForCodeblock = function(string) {
        string = string.replace(/[<>&]/g, function(whole) {
            switch(whole) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
            }
        });

        return string;
    };

    // 해석한 줄들을 전체적으로 확인해 번역한다.
    // this.translate에서 바로 하지 않는 이유는
    // 전후 줄의 상태에 따라 번역이 달라질 수 있기 때문이다.
    decode = function() {
        var startParagraphIfNeeded = function() {
            if(!startP) {
                line += "<p>";
                startP = true;
            }
        },

        closeParagraphIfNeeded = function() {
            if(current.isNotParagraph() && startP) {
                line += "</p>";
                startP = false;
            }
        },

        startCodeblockIfNeeded = function() {
            if(!startCodeblock) {
                line += "<pre><code>";
                startCodeblock = true;
            }
        },

        closeCodeblockIfNeeded = function() {
            if(startCodeblock) {
                if((current.isNotCodeblock() && current.isNotBlank()) || (current.isBlank() && (below == null || below.isNotCodeblock()))) {
                    line += "</code></pre>";
                    startCodeblock = false;
                }
            }
        },

        temp = function() {
            var last;
            if(current.quote < stackedBlockElements.quoteLevel()) {
                if(prev.isBlank()) {
                    while(stackedBlockElements.lastIsNotBlockquote() || current.quote < stackedBlockElements.quoteLevel()) {
                        console.log(stackedBlockElements.last())
                        console.log(stackedBlockElements.quoteLevel())
                        line += stackedBlockElements.pop();
                    }
                }

            } else if(current.quote > stackedBlockElements.quoteLevel()) {
                if(prev && prev.isBlank()) {
                    while(stackedBlockElements.lastIsNotBlockquote()) {
                        line += stackedBlockElements.pop();
                    }
                }

                while(current.quote > stackedBlockElements.quoteLevel()) {
                    line += stackedBlockElements.push(BLOCKQUOTE, current.quote);
                }

            } else {
                if(current.level < stackedBlockElements.listLevel()) {
                    while(stackedBlockElements.lastIsNotBlockquote() && current.level < stackedBlockElements.listLevel()) {
                        line += stackedBlockElements.pop()
                    }

                } else if(current.level == stackedBlockElements.listLevel()){
                    if(current.isList()) {
                        if(current.tag != stackedBlockElements.last().tag) {
                            line += stackedBlockElements.pop();
                        } else {
                            line += "</li>";
                        }
                    }

                }
            }


            if(current.isList() && current.level > stackedBlockElements.listLevel()) {
                while(current.level > (level = stackedBlockElements.listLevel())) {
                    line += stackedBlockElements.push(current.tag, current.level);
                }

            } else if(current.level == stackedBlockElements.listLevel()) {
                if(current.isList()) {
                    line += "<li>";
                }
            }
        },

        // closeListIfNeeded = function() {
        //     if(current.level != 0) {

        //         if(current.level < listNested.length) {
        //             closeList(current.level);

        //         } else if(above && current.quote < above.quote) {
        //             closeList(0);

        //         } else if(current.level == listNested.length){
        //             if(current.isUnorderedList() || current.isOrderedList()) {
        //                 line += "</li>";
        //                 if(current.tag != listNested[listNested.length - 1]) {
        //                     line += "</" + listNested[listNested.length - 1] + ">";
        //                 }
        //             }

        //         }

        //     } else if(listNested.length != 0) {
        //         closeList(0);
        //     }
        // },

        // startOrCloseBlockquoteIfNeeded = function() {
        //     var count;

        //     if(current.quote < stackedBlockElements.quoteLevel && prev.isBlank()) {
        //         while(stackedBlockElements.last().tag != BLOCKQUOTE || stackedBlockElements.last().level != current.quote) {
        //             if(stackedBlockElements.last().tag != BLOCKQUOTE) {
        //                 line += "</li>"
        //             }
        //             line += "</" + stackedBlockElements.pop().tag + ">";
        //         }

        //     } else if(current.quote > stackedBlockElements.quoteLevel) {
        //         count = current.quote - stackedBlockElements.quoteLevel;
        //         for(j = 0; j < count; j++) {
        //             line += "<blockquote>";
        //             stackedBlockElements.push({
        //                 'tag':   BLOCKQUOTE,
        //                 'level': current.quote
        //             })
        //         }
        //     } 
        // },

        // startListIfNeeded = function() {
        //     var j, k;

        //     if(current.level != 0) {
        //         if(current.level > listNested.length) {
        //             k = current.level - listNested.length;
        //             for(j = 0; j < k; j++) {
        //                 listNested[listNested.length] = current.tag;
        //                 line += "<" + current.tag + "><li>";
        //                 stackedBlockElements.push(current.tag)
        //             }
        //             startLI = true;

        //         } else {
        //             if(current.isUnorderedList() || current.isOrderedList()) {
        //                 if(current.level == listNested.length && current.tag != listNested[listNested.length - 1]) {
        //                     line += "<" + current.tag + ">";
        //                     listNested[listNested.length - 1] = current.tag;
        //                     stackedBlockElements.push(current.tag)
        //                 }
        //                 line += "<li>";
        //                 startLI = true;
        //             }
        //         }
        //     }
        // },

        startParagraphInListIfNeeded = function() {
            var addOpenParagraphTag = function() {
                line += "<p>";
                startP = true;
            },

            j, idxAbove, idxBelow, aboveIdxAbove, belowIdxBelow;

            if(current.level != 0) {
                if(stackedBlockElements.listLevel() > 0 && !startP && current.isNotCodeblock()) {
                    if(next && below && next.isBlank() && below.level == current.level) {
                        addOpenParagraphTag();

                    } else if(prev && above && prev.isBlank() && above.level == current.level) {
                        addOpenParagraphTag();
                        
                    } else {
                        idxAbove = idxAboveThisList(i);
                        aboveIdxAbove = aboveExceptBlank(idxAbove);
                        idxBelow = idxBelowThisList(i);
                        belowIdxBelow = belowExceptBlank(idxBelow);

                        if(idxAbove && aboveIdxAbove && analyzedSentences[idxAbove].isBlank() && aboveIdxAbove.level == current.level) {
                            addOpenParagraphTag();

                        } else if(idxBelow && belowIdxBelow && analyzedSentences[idxBelow].isBlank() && belowIdxBelow.level == current.level) {
                            addOpenParagraphTag();

                        } else {
                            for(j = i + 1; j < idxBelow; j++) {
                                if(analyzedSentences[j].isParagraph()) {
                                    analyzedSentences[j].tag = undefined;
                                }
                            }
                        }
                    }
                }
            }
        },

        string = "",
        listNested = Array(),
        nowQuotes = 0,

        startP         = false,
        startLI        = false,
        startCodeblock = false,
        line, current, i, prev, next, above, below;

        // 줄 단위로 확인한다.
        for(i = 0; i < analyzedSentences.length; i++) {
            line = "";
            current = analyzedSentences[i];
            prev = previousLine(i);
            next = nextLine(i);
            above = aboveExceptBlank(i);
            below = belowExceptBlank(i);

            // console.log(current);
            // console.log(stackedBlockElements.size());
            // console.log(stackedBlockElements.stack());

            closeParagraphIfNeeded();
            closeCodeblockIfNeeded();

            // blockquote, ul/ol/li 시작/종료 여부를 판단.
            if(current.isNotBlank()) {
                temp();
                // closeListIfNeeded();
                // startOrCloseBlockquoteIfNeeded();
                // startListIfNeeded();
                // startParagraphInListIfNeeded();
            }

            if(current.isCodeblock()) {
                current.content = replaceForCodeblock(current.content);
            } else {
                current.content = decodeInline(current.content);
            }

            switch(current.tag) {
            case H1:    line += "<h1>" + current.content + "</h1>"; break;
            case H2:    line += "<h2>" + current.content + "</h2>"; break;
            case H3:    line += "<h3>" + current.content + "</h3>"; break;
            case H4:    line += "<h4>" + current.content + "</h4>"; break;
            case H5:    line += "<h5>" + current.content + "</h5>"; break;
            case H6:    line += "<h6>" + current.content + "</h6>"; break;
            case HR:    line += "<hr/>";                      break;
            case BLANK: line += "\n";                         break;
            case P:
                startParagraphIfNeeded();
                line += current.content;
                break;

            case CODEBLOCK:
                startCodeblockIfNeeded();
                line += current.content + "\n";
                break;

            default:
                line += current.content;
                break;
            }

            string += line;
            console.log(line);
        }

        console.log(string);
        return string;
    };

    return (function() {
        
        //
        // ### public methods
        /////////////////////

        return {
            decode: function(string) {
                return translate.call(this, string);
            },

            // - sourceTextareaSelector : 마크다운 형식의 문자열이 있는 HTML의 contentarea 요소의 셀렉터
            // - targetElementSelector : HTML 형식의 번역 결과가 출력될 HTML 요소의 셀렉터
            run: function(sourceTextareaSelector, targetElementSelector) {
                var self = this, interval = null, timeout = null;

                // 파이어폭스는 한글 상태에서 키보드를 눌렀을 때 최초의 한 번을 제외하고는 이벤트가 발생하지 않는 괴이한 현상이 있다.
                // 그래서 브라우저가 파이어폭스일때는 최초의 한 번을 이용, 강제로 이벤트를 계속 발생시킨다.
                $(sourceTextareaSelector).keydown(function(event) {
                    if(navigator.userAgent.toLowerCase().indexOf('firefox') != -1) {
                        if (event.keyCode == 0) {
                            if(interval == null) {
                                interval = setInterval(function() {
                                    $(sourceTextareaSelector).trigger('keyup');
                                }, 1000);
                            }

                        } else {
                            if(interval != null) {
                                clearInterval(interval);
                                interval = null;
                            }
                        }
                    }
                });

                $(sourceTextareaSelector).keyup(function(event) {
                    if(!timeout) {
                        timeout = setTimeout(function() {
                            $(targetElementSelector).html( translate.call(self, $(sourceTextareaSelector).val()) );
                            timeout = null;
                        }, 500);
                    }
                });

                $(sourceTextareaSelector).trigger('keyup');
            },

            // 추가적인 인라인 요소 번역 함수를 설정한다.
            // 이는 기존의 인라인 요소 문법에 대한 확인이 모두 끝난 다음에 실행된다.
            addInlineRules: function(rulesArray) {
                inlineRule.addRule(rulesArray)
            }
        }
    })();
})();
