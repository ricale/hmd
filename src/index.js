// # how to use
// - lemonJuice.run(sourceTextareaElement, targetElement, options)
// - lemonJuice.decode(string)
//
// - more information: https://github.com/ricale/lemon-juice, http://weblog.ricalest.net/post/4/

module.exports = (function() {
    "use strict";

    if (!Array.prototype.last) {
        Array.prototype.last = function(){
            return this[this.length - 1];
        };
    }

    var listLevel, listLevelInBlockquote;
    var translate;
    var matching;
    var matchBlockquotes;
    var getIndentLevel;
    var decode;

    //
    // # private constants
    //////////////////////

    // 어떤 마크다운 문법이 적용되었는지 구분할 때 쓰일 구분자들 (string) 
    var P = "p";
    var H1 = "h1";
    var H2 = "h2";
    var H3 = "h3";
    var H4 = "h4";
    var H5 = "h5";
    var H6 = "h6";
    var HR = "hr";
    var UL = "ul";
    var OL = "ol";
    var BLANK = "blank";
    var CODEBLOCK = "codeblock";
    var BLOCKQUOTE = "blockquote";

    // ## 블록 요소 마크다운의 정규 표현식들

    // 반드시 지켜져야 할 해석 순서
    // Blockquote > Heading Underlined > HR > (UL, OL, ContinuedList) > (Codeblock, Heading, ReferencedId)
    // Blank > Codeblock

    var regExpBlockquote    = /^[ ]{0,3}(>+)[ ]?([ ]*.*)$/;
    var regExpH1Underlined  = /^=+$/;
    var regExpH2Underlined  = /^-+$/;
    var regExpHR            = /^[ ]{0,3}([-_*][ ]*){3,}$/;
    var regExpUL            = /^([\s]*)[*+-][ ]+(.*)$/;
    var regExpOL            = /^([\s]*)[\d]+\.[ ]+(.*)$/;
    var regExpBlank         = /^[\s]*$/;
    var regExpContinuedList = /^([ ]{1,8})([\s]*)(.*)/;
    var regExpCodeblock     = /^([ ]{0,3}\t|[ ]{4})([\s]*.*)$/;
    var regExpHeading       = /^(#{1,6}) (.*[^#])(#*)$/;
    var regExpReferencedId = [
        /^[ ]{0,3}\[([^\]]+)\]:[\s]*<([^\s>]+)>[\s]*(?:['"(](.*)["')])?$/,
        /^[ ]{0,3}\[([^\]]+)\]:[\s]*([^\s]+)[\s]*(?:['"(](.*)["')])?$/
    ];

    var INTERVAL_FOR_KEY_PRESS = 200;
    var INTERVAL_FOR_UPDATE    = 1000;

    //
    // # private objects
    //////////////////////

    var escapeRule = (function() {
        var regexp = /\\([\\\-\*\.\[\]\(\)_+<>#`^])/g,
            returnRegexp = /;;ESCAPE([0-9]+);;/g,
            replacee = ['-', '_', '*', '+', '.', '<',    '>',    '#', '[', ']',  '(',  ')',  '`',  '\\',  '^'],
            result   = ['-', '_', '*', '+', '.', '&lt;', '&gt;', '#', '[', ']',  '(',  ')',  '`',  '\\',  '^'],
            replacer = {},
            idx;

        for(idx in replacee) {
            if (replacee.hasOwnProperty(idx)) {
                replacer[replacee[idx]] = ';;ESCAPE' + idx + ';;';
            }
        }

        return (function() {
            return {
                decode: function(string) {
                    string = string.replace(regexp, function(match, p1) {
                        return replacer[p1];
                    });

                    return string;
                },

                escape: function(string) {
                    string = string.replace(returnRegexp, function(match, p1) {
                        return result[p1];
                    });

                    return string;
                }
            };
        })();
    })();

    var inlineRule = (function() {
        var NORMAL = 0,
            NEED_REPLACER = 1,
            REFERENCED = 2,

            replacees = [],
            replacerRegexp = /;;REPLACER([0-9]+);;/g,
            reference = {},
            rules,

        getReference = function(url, title) {
            return { url: url, title: title };
        },

        getRule = function(regexp, type, result, notReplaced) {
            return {
                regexp: regexp,
                type:   type,
                result: result, // or replacee
                notReplaced: notReplaced || null
            };
        },

        replacer = function() {
            return ';;REPLACER' + (replacees.length - 1) + ';;';
        },

        getTitle = function(title) {
            if(title === undefined) {
                return "";
            } else {
                return ' title="'+title+'"';
            }
        };


        // 반드시 지켜져야 할 해석 순서
        // - Strong > EM
        // - Img > Link
        // - ImgInline > LineInline
        rules = [
            getRule(/!\[([^\]]+)\][\s]*\[([^\]]*)\]/g,
                    REFERENCED,
                    function(url,alt,title) { return '<img src="'+url+'" alt="'+alt+'"'+getTitle(title)+'>'; }),

            getRule(/\[([^\]]+)\][\s]*\[([^\]]*)\]/g,
                    REFERENCED,
                    function(url,alt,title) { return '<a href="'+url+'" alt="'+alt+'"'+getTitle(title)+'>'; },
                    function(text) { return text + '</a>'; }),

            getRule(/``[\s]*(.+?)[\s]*``/g,                          NEED_REPLACER, function(p1) { return '<code>'+p1.replace(/</g,'&lt;')+'</code>'; }),
            getRule(/`([^`]+)`/g,                                    NEED_REPLACER, function(p1) { return '<code>'+p1.replace(/</g,'&lt;')+'</code>'; }),
            getRule(/!\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g, NEED_REPLACER, function(p1,p2,p3) { return '<img src="'+p2+'"'+getTitle(p3)+'>'; }),
            getRule(/\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,  NEED_REPLACER, function(p1,p2,p3) { return '<a href="'+p2+'"'+getTitle(p3)+'>'; }, function(p1) { return p1+'</a>'; }),
            getRule(/<(http[s]?:\/\/[^<]+)>/g,                       NEED_REPLACER, function(p1) { return '<a href="'+p1+'">'+p1+'</a>'; }),

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
                    replacees = [];
                    reference = {};
                },

                addRule: function(ruleArray) {
                    var i;

                    for(i in ruleArray) {
                        if(ruleArray.hasOwnProperty(i)) {
                            rules[rules.length] = getRule(ruleArray[i][0], NORMAL, ruleArray[i][1]);
                        }
                    }
                },

                addReference: function(id, url, title) {
                    reference[id] = getReference(url, title);
                },

                decode: function(string) {
                    var needReplacerCallback = function(match, p1, p2, p3) {
                        replacees[replacees.length] = rule.result(p1, p2, p3);
                        return replacer() + (rule.notReplaced !== null ? rule.notReplaced(p1) : '');
                    },

                    referencedCallback = function(match, p1, p2) {
                        ref = reference[p2 || p1];
                        if(ref === undefined) return match;

                        replacees[replacees.length] = rule.result(ref.url, p1, ref.title);
                        return replacer() + (rule.notReplaced !== null ? rule.notReplaced(p1) : '');
                    },

                    idx, rule, ref;

                    for(idx in rules) {
                        if(rules.hasOwnProperty(idx)) {
                            rule = rules[idx];

                            switch(rule.type) {
                            case NORMAL:
                                string = string.replace(rule.regexp, rule.result);
                                break;

                            case NEED_REPLACER:
                                string = string.replace(rule.regexp, needReplacerCallback);
                                break;

                            case REFERENCED:
                                string = string.replace(rule.regexp, referencedCallback);
                                break;
                            }
                        }
                    }

                    return string;
                },

                escape: function(string) {
                    string = string.replace(replacerRegexp, function(match, p1) {
                        return replacees[p1];
                    });

                    replacees = [];

                    return string;
                }
            };
        })();
    })();

    var analyzedSentences = (function() {
        var sentences = [],
            currentIndex = null;

        return (function() {
            return {
                init: function() {
                    sentences = [];
                    currentIndex = null;
                },

                push: function(analyzedSentence) {
                    analyzedSentence.index = sentences.length;
                    sentences.push(analyzedSentence);
                },

                setCurrentIndex: function(index) {
                    if(index < 0) {
                        currentIndex = null;
                    } else if(index >= sentences.length) {
                        currentIndex = null;
                    } else {
                        currentIndex = index;
                    }

                    return currentIndex;
                },

                goNext: function() {
                    return this.setCurrentIndex(currentIndex !== null ? currentIndex + 1 : 0);
                },

                current: function() {
                    return sentences[currentIndex];
                },

                last: function(params) {
                    if(params === undefined) {
                        return sentences.last();
                    } else {
                        sentences[sentences.length - 1].tag = params.tag;
                    }
                },

                get: function(index) {
                    return sentences[index];
                },

                size: function() {
                    return sentences.length;
                },

                previousLine: function(index) {
                    index = index === undefined ? currentIndex : index;
                    return index > 1 ? sentences[index - 1] : null;
                },

                nextLine: function(index) {
                    index = index === undefined ? currentIndex : index;
                    return index < sentences.length - 1 ? sentences[index + 1] : null;
                },

                previousBlank: function(index) {
                    var i;
                    index = index === undefined ? currentIndex : index;

                    for(i = index - 1; i >= 0; i--) {
                        if(sentences[i].isBlank()) {
                            return sentences[i];
                        }
                    }

                    return null;
                },

                nextBlank: function(index) {
                    var i;
                    index = index === undefined ? currentIndex : index;

                    for(i = index + 1; i < sentences.length; i++) {
                        if(sentences[i].isBlank()) {
                            return sentences[i];
                        }
                    }

                    return null;
                },

                previousLineExceptBlank: function(index) {
                    var i;
                    index = index === undefined ? currentIndex : index;

                    for(i = index - 1; i >= 0; i--) {
                        if(sentences[i].isNotBlank()) {
                            return sentences[i];
                        }
                    }

                    return null;
                },

                nextLineExceptBlank: function(index) {
                    var i;
                    index = index === undefined ? currentIndex : index;

                    for(i = index + 1; i < sentences.length; i++) {
                        if(sentences[i].isNotBlank()) {
                            return sentences[i];
                        }
                    }

                    return null;
                },

                previousChunk: function(index) {
                    var i, endOfChunk, blank;
                    index = index === undefined ? currentIndex : index;

                    for(i = index - 1; i >= 0; i--) {
                        if(sentences[i].isHeading() || sentences[i].isHorizontalLine()) {
                            return null;

                        } else if(sentences[i].isBlank()) {
                            endOfChunk = this.previousLineExceptBlank(i);
                            if(endOfChunk === null) {
                                return null;
                            }

                            blank = this.previousBlank(endOfChunk.index);
                            return blank === null ? endOfChunk : sentences[blank.index + 1];
                        }
                    }

                    return null;
                },

                nextChunk: function(index) {
                    var i;
                    index = index === undefined ? currentIndex : index;

                    for(i = index + 1; i < sentences.length; i++) {
                        if(sentences[i].isHeading() || sentences[i].isHorizontalLine() || (sentences[i].isList() && sentences[i].listLevel() == this.current().listLevel())) {
                            return null;

                        } else if(sentences[i].isBlank()) {
                            return this.nextLineExceptBlank(i);
                        }
                    }

                    return null;
                },

                previousList: function(index) {
                    var i, passBlankAlready = false;
                    index = index === undefined ? currentIndex : index;

                    for(i = index - 1; i >= 0; i--) {
                        if(sentences[i].isHeading() || sentences[i].isHorizontalLine()) {
                            return null;

                        } else if(sentences[i].isBlank()) {
                            if(passBlankAlready) {
                                return null;

                            } else {
                                passBlankAlready = true;
                            }

                        } else if(sentences[i].isNotBlank() && sentences.level === 0) {
                            return null;

                        } else if(sentences[i].isList()) {
                            return sentences[i];
                        }
                    }

                    return null;
                }
            };
        })();
    })();

    var blockElementStack = (function() {
        var elements = [],
            currentQuoteLevel = 0,
            currentListLevel = 0;

        return (function() {
            return {
                init: function() {
                    elements = [];
                    currentQuoteLevel = 0;
                    currentListLevel = 0;
                },

                push: function(tag, level) {
                    var result;
                    level = level === undefined ? 0 : level;

                    result = (elements.length > 0 && (elements.last().tag == P || elements.last().tag == CODEBLOCK)) ? this.pop() : "";

                    if(tag == BLOCKQUOTE) {
                        currentQuoteLevel += 1;

                    } else if(tag == UL || tag == OL) {
                        currentListLevel = level;
                        if(currentListLevel !== 0) {
                            currentListLevel += currentQuoteLevel * 100;
                        }
                    }

                    elements.push({
                        'tag':   tag,
                        'level': level
                    });

                    switch(tag)
                    {
                    case BLOCKQUOTE: return result + "<blockquote>";
                    case UL:         return result + "<ul><li>";
                    case OL:         return result + "<ol><li>";
                    case P:          return result + "<p>";
                    case H1:         return result + "<h1>";
                    case H2:         return result + "<h2>";
                    case H3:         return result + "<h3>";
                    case H4:         return result + "<h4>";
                    case H5:         return result + "<h5>";
                    case H6:         return result + "<h6>";
                    case CODEBLOCK:  return result + "<pre><code>";
                    case HR:         return result + "<hr/>";
                    }
                },

                pushToQuoteLevel: function(quote) {
                    var result = "";

                    while(quote > this.quoteLevel()) {
                        result += this.push(BLOCKQUOTE, quote);
                    }

                    return result;
                },

                pop: function() {
                    var i, last, element;

                    if(elements.length > 0) {
                        last = elements.last();
                        if(last.tag == BLOCKQUOTE) {
                            currentQuoteLevel -= 1;

                        } else if(last.tag == UL || last.tag == OL) {
                            currentListLevel = 0;
                            for(i = elements.length - 2; i >= 0; i--) {
                                if(elements[i].tag != BLOCKQUOTE) {
                                    currentListLevel = elements[i].level;
                                    break;
                                }
                            }

                            if(currentListLevel !== 0) {
                                currentListLevel += currentQuoteLevel * 100;
                            }

                        }
                    }

                    element = elements.pop();

                    switch(element.tag)
                    {
                    case BLOCKQUOTE: return "</blockquote>";
                    case UL:         return "</li></ul>";
                    case OL:         return "</li></ol>";
                    case P:          return "</p>";
                    case H1:         return "</h1>";
                    case H2:         return "</h2>";
                    case H3:         return "</h3>";
                    case H4:         return "</h4>";
                    case H5:         return "</h5>";
                    case H6:         return "</h6>";
                    case CODEBLOCK:  return "</code></pre>";
                    case HR:         return "";
                    }
                },

                popToQuoteLevel: function(quote) {
                    var result = "";

                    while(quote < this.quoteLevel()) {
                        result += this.pop();
                    }

                    return result;
                },

                popToListLevel: function(listLv) {
                    var result = "";

                    while(this.isNotEmpty() && this.lastIsNotBlockquote() && listLv < this.listLevel()) {
                        result += this.pop();
                    }

                    return result;
                },

                popToBlockquote: function() {
                    var result = "";

                    while(this.isNotEmpty() && this.lastIsNotBlockquote()) {
                        result += this.pop();
                    }

                    return result;
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

                isEmpty: function() {
                    return elements.length === 0;
                },

                isNotEmpty: function() {
                    return elements.length !== 0;
                },

                lastIsBlockquote: function() {
                    var last = elements.last();
                    return last && last.tag == BLOCKQUOTE;
                },

                lastIsNotBlockquote: function() {
                    var last = elements.last();
                    return !last || last.tag != BLOCKQUOTE;
                },

                lastIsParagraph: function() {
                    var last = elements.last();
                    return last && last.tag == P;
                },

                lastIsNotParagraph: function() {
                    var last = elements.last();
                    return !last || last.tag != P;
                },

                lastIsList: function() {
                    var last = elements.last();
                    return last && (last.tag == UL || last.tag == OL);
                },

                lastIsNotList: function() {
                    var last = elements.last();
                    return !last || (last.tag != UL && last.tag != OL);
                },

                lastIsCodeblock: function() {
                    var last = elements.last();
                    return last && last.tag == CODEBLOCK;
                },

                lastIsNotCodeblock: function() {
                    var last = elements.last();
                    return !last || last.tag != CODEBLOCK;
                },

                size: function() {
                    return elements.length;
                },

                stack: function() {
                    return elements;
                }
            };
        })();
    })();

    //
    // # Indent Helper: temporary included external library
    ////////////////////

    var IndentHelper = (function () {
        var indent = function(textarea, isReversed) {
            //////////
            // variable for indent function scope
            var tabCharacter = '    ',
                source,

            //////////
            // private getter
            getSourceInformation = function(textarea) {
                var content        = textarea.value,
                    selectionStart = textarea.selectionStart,
                    selectionEnd   = textarea.selectionEnd,
                    selectedString = content.substring(selectionStart, selectionEnd);

                return {
                    element:         textarea,
                    content:         content,
                    selectionStart:  selectionStart,
                    selectionEnd:    selectionEnd,
                    selectionString: selectedString
                };
            },

            getReplaceeInformation = function() {
                var start   = source.content.lastIndexOf('\n', source.selectionStart - 1),
                    end     = source.content.indexOf('\n', source.selectionEnd),
                    content;

                end     = end == -1 ? source.content.length - 1 : end;
                content = source.content.substring(start, end);

                return {
                    start:   start,
                    end:     end,
                    content: content
                };
            },

            //////////
            // helper
            replaceString = function(start, end, indentedString) {
                source.element.value = source.content.substring(0, start) + indentedString + source.content.substring(end, source.content.length);
            },

            setTextareaSelection = function(replaceStart, selectionStart, selectionEnd) {
                source.element.selectionStart = selectionStart;
                if(source.element.selectionStart < replaceStart + 1)
                    source.element.selectionStart = replaceStart + 1;

                if(selectionEnd < source.element.selectionStart)
                    selectionEnd = source.element.selectionStart;
                source.element.selectionEnd = selectionEnd;
            },

            //////////
            // indent or unindent functions
            indentSelectedLine = function() {
                replaceString(source.selectionStart, source.selectionEnd, tabCharacter);
                setTextareaSelection(-1, source.selectionStart + tabCharacter.length, source.selectionStart + tabCharacter.length);
            },

            unindentSelectedLine = function() {
                var removedTabCharacterLength,
                    replacee = getReplaceeInformation(),
                    replacedRegExp       = /(^|\n)([ ]{1,4})/;

                if(replacee.content.match(replacedRegExp) === null) {
                    removedTabCharacterLength = 0;
                } else {
                    removedTabCharacterLength = replacee.content.match(replacedRegExp)[2].length;
                }

                replaceString(replacee.start, replacee.end, replacee.content.replace(replacedRegExp, '$1'));
                setTextareaSelection(replacee.start, source.selectionStart - removedTabCharacterLength, source.selectionStart - removedTabCharacterLength);
            },

            indentSelectedLines = function() {
                var replacee = getReplaceeInformation(),
                    replacedRegExp       = /(^|\n)(?!\n)/g;

                replaceString(replacee.start, replacee.end, replacee.content.replace(replacedRegExp, "$1"+tabCharacter));
                setTextareaSelection(replacee.start, source.selectionStart + tabCharacter.length, source.selectionEnd + (tabCharacter.length * source.selectionString.match(replacedRegExp).length));
            },

            unindentSelectedLines = function() {
                var replacee = getReplaceeInformation(),
                    replacedRegExp       = /(^|\n)([ ]{1,4})/g,
                    removedTabs          = replacee.content.match(replacedRegExp),
                    removedTabCharacterLength = 0,
                    firstTabLength            = 0,
                    lastMatchOfSelectedString,
                    index,
                    value;

                if(removedTabs !== null) {
                    lastMatchOfSelectedString = source.selectionString.match('\n[ ]{0,3}$');

                    for(index = 0; index < removedTabs.length; index++) {
                        value = removedTabs[index];
                        if(index != removedTabs.length - 1 || !lastMatchOfSelectedString) {
                            removedTabCharacterLength += (value.match(/[ ]+/)[0].length);
                        } else {
                            removedTabCharacterLength += lastMatchOfSelectedString[0].length - 1;
                        }
                    }

                    if(source.content.substring(replacee.start, source.selectionStart).match(replacedRegExp) !== null) {
                        firstTabLength = removedTabs[0].match(/[ ]+/)[0].length;
                    }
                }

                replaceString(replacee.start, replacee.end, replacee.content.replace(replacedRegExp, "$1"));
                setTextareaSelection(replacee.start, source.selectionStart - firstTabLength, source.selectionEnd - removedTabCharacterLength);
            };



            if(document.selection) {
                ////////////
                // for IE //
                ////////////

            } else {
                source = getSourceInformation(textarea);

                if(source.selectionString.match(/\n/) === null) {
                    if(isReversed)
                        unindentSelectedLine();
                    else
                        indentSelectedLine();

                } else {
                    if(isReversed)
                        unindentSelectedLines();
                    else
                        indentSelectedLines();
                }
            }
        };

        return {
            indent: indent,

            eventListener: function (event) {
                if(event !== undefined && event.keyCode == 9) {
                    event.preventDefault();
                    indent(this, event.shiftKey);
                }
            },

            addEventListener: function(targetElement, eventName) {
                eventName = (eventName || 'keydown');

                if(targetElement.addEventListener) {
                    targetElement.addEventListener(eventName, this.eventListener, false);
                } else if(targetElement.attachEvent) {
                    targetElement.attachEvent("on"+eventName, this.eventListener);
                } else {
                    targetElement[eventName] = this.eventListener;
                }
            }
        };
    })();


    // # private inner classes
    ////////////////////

    var AnalyzedSentence = function() {
        this.index = null;
        // 이 문장의 실제 내용 (string)
        this.content = null;
        // 이 문장에 적용될 HTML의 블록요소를 구분하기 위한 구분자 (string)
        this.tag = null;
        // 이 문장의 목록 요소 중첩 정도 (integer)
        this.level = 0;
        // 이 문장의 인용 블록 요소 중첩 정도 (integer)
        this.quote = 0;
    };

    AnalyzedSentence.prototype.listLevel = function() {
        return this.level === 0 ? 0 : this.level + this.quote * 100;
    };

    AnalyzedSentence.prototype.isParagraph = function() {
        return this.tag == P;
    };

    AnalyzedSentence.prototype.isUnorderedList = function() {
        return this.tag == UL;
    };

    AnalyzedSentence.prototype.isOrderedList = function() {
        return this.tag == OL;
    };

    AnalyzedSentence.prototype.isList = function() {
        return this.isUnorderedList() || this.isOrderedList();
    };

    AnalyzedSentence.prototype.isBlank = function() {
        return this.tag == BLANK;
    };

    AnalyzedSentence.prototype.isCodeblock = function() {
        return this.tag == CODEBLOCK;
    };

    AnalyzedSentence.prototype.isHeading = function() {
        return (this.tag == H1 ||
                this.tag == H2 ||
                this.tag == H3 ||
                this.tag == H4 ||
                this.tag == H5 ||
                this.tag == H6);
    };

    AnalyzedSentence.prototype.isHorizontalLine = function() {
        return this.tag == HR;
    };

    AnalyzedSentence.prototype.isNotParagraph = function() {
        return this.tag != P;
    };

    AnalyzedSentence.prototype.isNotUnorderedList = function() {
        return this.tag != UL;
    };

    AnalyzedSentence.prototype.isNotOrderedList = function() {
        return this.tag != OL;
    };

    AnalyzedSentence.prototype.isNotList = function() {
        return this.isNotUnorderedList() && this.isNotOrderedList();
    };

    AnalyzedSentence.prototype.isNotBlank = function() {
        return this.tag != BLANK;
    };

    AnalyzedSentence.prototype.isNotCodeblock = function() {
        return this.tag != CODEBLOCK;
    };

    AnalyzedSentence.prototype.isNotHeading = function() {
        return (this.tag != H1 &&
                this.tag != H2 &&
                this.tag != H3 &&
                this.tag != H4 &&
                this.tag != H5 &&
                this.tag != H6);
    };

    AnalyzedSentence.prototype.isNotHorizontalLine = function() {
        return this.tag != HR;
    };

    // # private methods
    ////////////////////

    translate = function(sourceString) {
        var array = sourceString.split(/\n/), i, r, self,

        initAll = function() {
            inlineRule.init();

            listLevel = [];
            listLevelInBlockquote = [];

            analyzedSentences.init();
            blockElementStack.init();
        },

        isEndOfList = function(result) {
            return result.isNotBlank() && result.level === 0;
        },

        cleanListInformation = function() {
            if(listLevel.length > 0) {
                listLevel = [];
                listLevelInBlockquote = [];
            }

            if(listLevelInBlockquote.length > 0) {
                listLevelInBlockquote = [];
            }
        };

        self = this;

        initAll();

        for(i = 0; i < array.length; i++) {
            if((r = matching(array[i])) !== null) {
                analyzedSentences.push(r);

                if(isEndOfList(r)) {
                    cleanListInformation();
                }
            }
        }

        return decode();
    };

    
    matching = function(string) {
        var sentence = matchBlockquotes(string), line = null, result,

        isBlank = function() {
            return sentence.content.match(regExpBlank) !== null;
        },

        isUnderlineForH1 = function() {
            return sentence.content.match(regExpH1Underlined) !== null && analyzedSentences.size() !== 0 && analyzedSentences.last().isParagraph();
        },

        isUnderlineForH2 = function() {
            return sentence.content.match(regExpH2Underlined) !== null && analyzedSentences.size() !== 0 && analyzedSentences.last().isParagraph();
        },

        isHR = function() {
            return sentence.content.match(regExpHR) !== null;
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

                    noListBefore                         = function() { return levels.length === 0; },
                    existListWithOnlyOneLevel            = function() { return levels.length == 1; },
                    indentIsSameAsFirstLevelOfList       = function() { return space == levels[0]; },
                    isParagraphContinuedFromPrevListItem = function() { return space >= (now + 1) * 4; },
                    isNextLevelOfPrevListItem            = function() { return space > levels[now - 1] && space > (now - 1) * 4; },
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
                }, // getListLevel

                r = getListLevel(line[1], sentence.quote !== 0);

                if(r.isNotCodeblock()) {
                    sentence.tag   = r.tag !== null ? r.tag : tag;
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
            return matchWithListForm(UL, regExpUL, sentence);
            
        },

        matchWithOLForm = function() {
            return matchWithListForm(OL, regExpOL, sentence);
        },

        matchContinuedList = function(string, last) {
            var previousLineIsList = function() { // 바로 윗 줄이 리스트인가
                return prev !== null && prev.level !== 0;
            },

            isCodeblock = function() {
                return line !== null && prev.isCodeblock() && getIndentLevel(line[1]) == 8 && (prev.level - 1) * 4 <= getIndentLevel(line[2]);
            },

            listIsContinuedNow = function() { // 공백이 아닌 문장 중 가장 최근의 문장이 리스트인가
                return above !== null && above.level !== 0;
            },

            result = new AnalyzedSentence(),
            above = analyzedSentences.previousLineExceptBlank(analyzedSentences.size()),
            prev = analyzedSentences.previousLine(analyzedSentences.size()),
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

                if(line === null) {
                    result = matchBlockquotes(string);
                    if(result.quote == above.quote) {
                        line = result.content.match(regExpContinuedList);

                        if(line === null) {
                            return null;
                        }
                    } else {
                        above = analyzedSentences.previousList(analyzedSentences.size());
                        if(above && result.quote == above.quote) {
                            line = result.content.match(regExpContinuedList);

                            if(line === null) {
                                return null;
                            }
                        } else {
                            return null;
                        }
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
                if(result === null) 
                    return null;

                indent = getIndentLevel(line[1] + line[2]);
                indent = indent / 4 - indent / 4 % 1 + (indent % 4 !== 0);

                result.level += indent > above.level ? above.level : indent;
                result.quote = above.quote;

                return result;
            }

            // 위의 어떠한 사항에도 해당하지 않는다면 이 줄은 목록 요소 내부의 블록 요소가 아니다.
            return null;
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

            if((line = sentence.content.match(regExpReferencedId[0])) === null) {
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
            analyzedSentences.last({'tag': H1});
            return null;
        },

        setPrevLineAsH2 = function() {
            analyzedSentences.last({'tag': H2});
            return null;
        },

        setHRSentence = function() {
            sentence.tag     = HR;
            sentence.content = "";
            return sentence;
        },

        setReference = function() {
            inlineRule.addReference(result[1], result[2], result[3]);
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

        if((result = matchContinuedList(string, sentence))) return result;

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

            if(line === null) return result;

            result.quote += line[1].length;
            result.content = line[2];
        }
    };

    // 들여쓰기(blank)가 몇 개의 공백(space)인지 확인해 결과를 반환한다.
    // 탭(tab) 문자는 4개의 공백으로 계산한다.
    getIndentLevel = function(blank) {
        var indent = blank.match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g),
            space = 0, i;

        if(indent !== null) {
            for(i = 0; i < indent.length; i++) {
                if(indent[i].match(/^[ ]{1,3}$/) !== null) {
                    space += indent[i].length;
                } else {
                    space += 4;
                }
            }
        }

        return space;
    };

    // 해석한 줄들을 전체적으로 확인해 번역한다.
    // this.translate에서 바로 하지 않는 이유는
    // 전후 줄의 상태에 따라 번역이 달라질 수 있기 때문이다.
    decode = function() {
        var closeBlockElementsIfNeeded = function() {
            var below = analyzedSentences.nextLineExceptBlank();

            if(current.isNotParagraph() && blockElementStack.lastIsParagraph()) {
                string += blockElementStack.pop();
            }

            if(blockElementStack.lastIsCodeblock()) {
                if((current.isNotCodeblock() && current.isNotBlank()) || (current.isBlank() && (below === null || below.isNotCodeblock()))) {
                    string += blockElementStack.pop();
                }
            }
        },

        closeNestableElementsIfNeeded = function() {
            var prev = analyzedSentences.previousLine(),
                closeList = function() {
                    if(current.listLevel() < blockElementStack.listLevel()) {
                        string += blockElementStack.popToListLevel(current.listLevel());

                    } else if(current.listLevel() == blockElementStack.listLevel()) {
                        if(current.isList()) {
                            if(current.tag != blockElementStack.last().tag) {
                                string += blockElementStack.pop();
                            } else {
                                string += "</li>";
                            }
                        }

                    }
                };

            if(current.quote < blockElementStack.quoteLevel()) {
                if(prev.isBlank()) {
                    string += blockElementStack.popToQuoteLevel(current.quote);
                }
                closeList();

            } else if(current.quote > blockElementStack.quoteLevel()) {
                if(prev && prev.isBlank()) {
                    string += blockElementStack.popToBlockquote();
                }

                string += blockElementStack.pushToQuoteLevel(current.quote);

            } else {
                closeList();
            }
        },

        openNestableElementsIfNeeded = function() {
            var current = analyzedSentences.current(),
                prev, previousChunk, nextChunk;


            if(current.isList() && current.listLevel() > blockElementStack.listLevel()) {
                string += blockElementStack.push(current.tag, current.level);

            } else if(current.listLevel() == blockElementStack.listLevel()) {
                if(current.isList()) {
                    string += "<li>";
                }
            }

            if((blockElementStack.isEmpty() || blockElementStack.lastIsNotParagraph()) && current.level !== 0) {
                prev = analyzedSentences.previousLine();

                if(current.isParagraph() && prev !== null && prev.isBlank()) {
                    if(current.listLevel() == blockElementStack.listLevel()) {
                        string += blockElementStack.push(P);
                    }

                } else if(current.isList()) {
                    nextChunk = analyzedSentences.nextChunk();
                    previousChunk = analyzedSentences.previousChunk();

                    if(nextChunk && current.listLevel() == nextChunk.listLevel()) {
                        string += blockElementStack.push(P);
                    } else if(previousChunk && current.listLevel() == previousChunk.listLevel()) {
                        string += blockElementStack.push(P);
                    }
                }
            }
        },

        openBlockElementsIfNeeded = function() {
            if(current.isHeading() || current.isHorizontalLine()) {
                string += blockElementStack.push(current.tag);

            } else if(current.isParagraph()) {
                if((blockElementStack.isEmpty() || blockElementStack.lastIsNotParagraph()) && blockElementStack.listLevel() === 0) {
                    string += blockElementStack.push(current.tag);
                }

            } else if(current.isCodeblock()) {
                if(blockElementStack.lastIsNotCodeblock()) {
                    string += blockElementStack.push(current.tag);
                }

            }
        },

        decodeContent = function() {
            if(current.isCodeblock()) {
                current.content = current.content.replace(/[<>&]/g, function(whole) {
                    switch(whole) {
                        case '<': return '&lt;';
                        case '>': return '&gt;';
                        case '&': return '&amp;';
                    }
                });

            } else {
                current.content = escapeRule.decode(current.content);
                current.content = inlineRule.decode(current.content);
                current.content = inlineRule.escape(current.content);
                current.content = escapeRule.escape(current.content);
            }

            if(current.isHeading() || current.isHorizontalLine()) {
                string += current.content + blockElementStack.pop();

            } else if(current.isBlank()) {
                string += "\n";

            } else if(current.isCodeblock()) {
                string += current.content + "\n";

            } else {
                string += current.content;
            }
        },

        string = "", current;

        // 줄 단위로 확인한다.
        while(analyzedSentences.goNext() !== null) {
            current = analyzedSentences.current();

            closeBlockElementsIfNeeded();

            if(current.isNotBlank()) {
                closeNestableElementsIfNeeded();
                openNestableElementsIfNeeded();
            }

            openBlockElementsIfNeeded();
            decodeContent();
        }

        return string;
    };

    inlineRule.addRule([
        [/--([^-\s]{1,2}|-[^-\s]|[^-\s]-|(?:[^\s].+?[^\s]))--/g,          '<del>$1</del>'],
        [/,,([^,\s]{1,2}|,[^,\s]|[^,\s],|(?:[^\s].+?[^\s])),,/g,          '<sub>$1</sub>'],
        [/\^\^([^\^\s]{1,2}|\^[^\^\s]|[^\^\s]\^|(?:[^\s].+?[^\s]))\^\^/g, '<sup>$1</sup>']
    ]);

    return {
        decode: function(string) {
            return translate.call(this, string);
        },

        // - sourceTextareaElement : 마크다운 형식의 문자열이 있는 HTML의 textarea element
        // - targetElement : HTML 형식의 번역 결과가 출력될 HTML element
        run: function(sourceTextareaElement, targetElement, options) {
            var scrollTargetElement = function() {
                var thisElement   = sourceTextareaElement,
                    targetScrollHeight = targetElement.scrollHeight,
                    targetClientHeight = targetElement.clientHeight,
                    thisScrollTop    = thisElement.scrollTop,
                    thisScrollHeight = thisElement.scrollHeight,
                    thisClientHeight = thisElement.clientHeight,
                    scrollTop = (thisScrollTop / (thisScrollHeight - thisClientHeight)) * (targetScrollHeight - targetClientHeight);

                targetElement.scrollTop = scrollTop;
                // $target.scrollTop(scrollTop);
            },

            triggerEvent = function(element, eventName) {
                var event; // The custom event that will be created

                if (document.createEvent) {
                    event = document.createEvent("HTMLEvents");
                    event.initEvent(eventName, true, true);
                } else {
                    event = document.createEventObject();
                    event.eventType = eventName;
                }

                event.eventName = eventName;

                if (document.createEvent) {
                    element.dispatchEvent(event);
                } else {
                    element.fireEvent("on" + event.eventType, event);
                }
            },

            addEvent = function(element, eventName, listener) {
                if(element.addEventListener) {
                    element.addEventListener(eventName, listener, false);
                } else if(element.attachEvent) {
                    element.attachEvent("on"+eventName, listener);
                } else {
                    element[eventName] = listener;
                }
            },

            // 파이어폭스는 한글 상태에서 키보드를 눌렀을 때 최초의 한 번을 제외하고는 이벤트가 발생하지 않는 현상이 있다.
            // 그래서 브라우저가 파이어폭스일때는 최초의 한 번을 이용, 강제로 이벤트를 계속 발생시킨다.
            forceKeydownEventForFirefox = function() {
                if(navigator.userAgent.toLowerCase().indexOf('firefox') != -1) {
                    if(forceFirfoxKeyPressIntervalId === null) {

                        forceFirfoxKeyPressIntervalId = setInterval(function() {
                            var now = new Date().getTime();
                            if(now - lastPressedTime > INTERVAL_FOR_KEY_PRESS) {
                                if(lastSource != sourceTextareaElement.value) {
                                    lastSource = sourceTextareaElement.value;
                                    triggerEvent(sourceTextareaElement, 'keydown');
                                }
                            }
                        }, INTERVAL_FOR_KEY_PRESS);
                    }
                }
            },

            decodeSourceTextareaElementText = function(event) {
                var now;

                if(event !== undefined && event.keyCode == 9 /* TAB Key */ && options.UseTabKey) {
                    event.preventDefault();
                    IndentHelper.indent(this, event.shiftKey);
                }

                now = new Date().getTime();
                if(now - lastPressedTime < INTERVAL_FOR_KEY_PRESS) {
                    clearTimeout(lastPressedTimeoutId);
                }

                lastPressedTime = now;
                lastPressedTimeoutId = setTimeout(function() {
                    targetElement.innerHTML = translate.call(self, sourceTextareaElement.value);
                    needToUpdate = false;
                    if(options.AutoScrollPreview) {
                        scrollTargetElement();
                    }
                    clearTimeout(firstPressedTimeoutId);
                }, INTERVAL_FOR_KEY_PRESS);

                if(!needToUpdate) {
                    needToUpdate = true;
                    firstPressedTimeoutId = setTimeout(function() {
                        targetElement.innerHTML = translate.call(self, sourceTextareaElement.value);
                        needToUpdate = false;
                        if(options.AutoScrollPreview) {
                            scrollTargetElement();
                        }
                    }, INTERVAL_FOR_UPDATE);
                }
            },

            self = this,
            lastSource = sourceTextareaElement.value,
            forceFirfoxKeyPressIntervalId = null,

            lastPressedTime = 0,
            lastPressedTimeoutId = null,
            firstPressedTimeoutId = null,
            needToUpdate = false;

            options = options === undefined ? {} : options;
            options.UseTabKey         = options.UseTabKey         === undefined ? true : options.UseTabKey;
            options.AutoScrollPreview = options.AutoScrollPreview === undefined ? true : options.AutoScrollPreview;
            // options.TabCharacter = options.TabCharacter === undefined ? 'space' : options.TabCharacter;


            forceKeydownEventForFirefox();
            decodeSourceTextareaElementText();
            addEvent(sourceTextareaElement, 'keydown', decodeSourceTextareaElementText);
            addEvent(sourceTextareaElement, 'keyup',   function (event) {
                lastSource = event.target.value;
            });

            if(options.AutoScrollPreview) {
                addEvent(sourceTextareaElement, 'scroll', scrollTargetElement);
            }
        },

        // 추가적인 인라인 요소 번역 함수를 설정한다.
        // 이는 기존의 인라인 요소 문법에 대한 확인이 모두 끝난 다음에 실행된다.
        addInlineRules: function(rulesArray) {
            inlineRule.addRule(rulesArray);
        }
    };
})();
