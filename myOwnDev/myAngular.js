(function () {
    function Scope() {
        //双$符号代表是私有属性
        this.$$watchers = [];
        this.$$lastDirtyWatch = null;
        this.$$asyncQueue = [];
        this.$$applyAsyncQueue = [];
        this.$$applyAsyncId = null;
        this.$$postDigestQueue = [];
        this.$root = this;
        this.$$children = [];
        this.$$listeners = {};
        this.$$phase = null;
    }
    Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
        var self = this;
        var watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function () { },
            valueEq: !!valueEq,
            last: initWatchVal
        };
        this.$$watchers.unshift(watcher);
        this.$root.$$lastDirtyWatch = null;
        return function () {
            var index = self.$$watchers.indexOf(watcher);
            if (index >= 0) {
                self.$$watchers.splice(index, 1);
                //防止在$digestOnce中遍历所有的watcher时其中某一个watcher的listener中删掉其他watcher的情况
                self.$root.$$lastDirtyWatch = null;
            }
        };
    };
    Scope.prototype.$$digestOnce = function () {
        var self = this;
        var dirty;
        var continueLoop = true;
        this.$$everyScope(function (scope) {
            var newValue;
            var oldValue;
            _.forEachRight(scope.$$watchers, function (watcher) {
                try {
                    //判断watcher是否存在是因为有可能在$digest循环watcher的过程中某一个watcher在其监听函数中会将所有的this.$$watchers里面所有的watcher全部删掉
                    if (watcher) {
                        newValue = watcher.watchFn(scope);
                        oldValue = watcher.last;
                        //if (newValue !== oldValue) {
                        if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                            self.$root.$$lastDirtyWatch = watcher;
                            //watcher.last = newValue;
                            watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                            watcher.listenerFn(
                                newValue,
                                (oldValue == initWatchVal ? newValue : oldValue),
                                scope
                            );
                            dirty = true;
                        } else if (self.$root.$$lastDirtyWatch === watcher) {
                            continueLoop = false;
                            return false;
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            });
            return continueLoop;
        });

        return dirty;
    };
    Scope.prototype.$digest = function () {
        var ttl = 10;//ttl means Time To Live
        var dirty;
        this.$root.$$lastDirtyWatch = null;
        this.$beginPhase("$digest");

        if (this.$root.$$applyAsyncId) {
            clearTimeout(this.$root.$$applyAsyncId);
            this.$$flushApplyAsync();
        }

        do {
            while (this.$$asyncQueue.length) {
                try {
                    var asyncTask = this.$$asyncQueue.shift();
                    asyncTask.scope.$eval(asyncTask.expression);
                } catch (e) {
                    console.error(e);
                }
            }
            dirty = this.$$digestOnce();
            if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
                this.$clearPhase();
                throw "10 digest iterations reached";
            }
        } while (dirty || this.$$asyncQueue.length);
        this.$clearPhase();

        while (this.$$postDigestQueue.length) {
            try {
                this.$$postDigestQueue.shift()();
            } catch (e) {
                console.error(e);
            }
        }
    };
    Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
        if (valueEq) {
            return _.isEqual(newValue, oldValue);
        } else {
            return newValue === oldValue || (
                typeof newValue === "number" &&
                typeof oldValue === "number" &&
                isNaN(newValue) &&
                isNaN(oldValue)
            );
        }
    };
    Scope.prototype.$eval = function (expr, locals) {
        return expr(this, locals);
    };
    Scope.prototype.$apply = function (expr) {
        try {
            this.$beginPhase("$apply");
            return this.$eval(expr);
        } finally {
            this.$clearPhase();
            this.$root.$digest();
        }
    };
    Scope.prototype.$evalAsync = function (expr) {
        var self = this;
        if (!self.$$phase && !self.$$asyncQueue.length) {
            setTimeout(function () {
                if (self.$$asyncQueue.length) {
                    self.$root.$digest();
                }
            }, 0);
        }
        self.$$asyncQueue.push({
            scope: self,
            expression: expr
        });
    };
    Scope.prototype.$beginPhase = function (phase) {
        if (this.$$phase) {
            throw this.$$phase + " already in progress";
        }
        this.$$phase = phase;
    };
    Scope.prototype.$clearPhase = function () {
        this.$$phase = null;
    };
    Scope.prototype.$applyAsync = function (expr) {
        var self = this;
        self.$$applyAsyncQueue.push(function () {
            self.$eval(expr);
        });
        if (self.$root.$$applyAsyncId === null) {
            self.$root.$$applyAsyncId = setTimeout(function () {
                //self.$apply(function () {
                //    while (self.$$applyAsyncQueue.length) {
                //        self.$$applyAsyncQueue.shift()();
                //    }
                //    self.$$applyAsyncId = null;
                //});
                //_.bind() 第一个参数是要绑定的函数，第二个参数是函数里面的this指向
                self.$apply(_.bind(self.$$flushApplyAsync, self));
            }, 0);
        }
    };
    Scope.prototype.$$flushApplyAsync = function () {
        while (this.$$applyAsyncQueue.length) {
            try {
                this.$$applyAsyncQueue.shift()();
            } catch (e) {
                console.error(e);
            }
        }
        this.$root.$$applyAsyncId = null;
    };
    Scope.prototype.$$postDigest = function (fn) {
        this.$$postDigestQueue.push(fn);
    };
    Scope.prototype.$watchGroup = function (watchFns, listenerFn) {
        var self = this;
        var newValues = new Array(watchFns.length);
        var oldValues = new Array(watchFns.length);
        var changeReactionScheduled = false;
        var firstRun = true;

        if (watchFns.length === 0) {
            var shouldCall = true;
            self.$evalAsync(function () {
                if (shouldCall) {
                    listenerFn(newValues, newValues, self);
                }
            });
            return function () {
                shouldCall = false;
            };
        }

        function watchGroupListener() {
            if (firstRun) {
                firstRun = false;
                listenerFn(newValues, newValues, self);
            } else {
                listenerFn(newValues, oldValues, self);
            }
            changeReactionScheduled = false;
        }

        var destroyFunctions = _.map(watchFns, function (watchFn, i) {
            return self.$watch(watchFn, function (newValue, oldValue) {
                newValues[i] = newValue;
                oldValues[i] = oldValue;
                if (!changeReactionScheduled) {
                    changeReactionScheduled = true;
                    self.$evalAsync(watchGroupListener);
                }
            });
        });

        return function () {
            _.forEach(destroyFunctions, function (destroyFunction) {
                destroyFunction();
            });
        };
    };

    //Scope Inheritance
    Scope.prototype.$new = function (isolated, parent) {
        var child;
        parent = parent || this;
        if (isolated) {
            child = new Scope();
            child.$root = parent.$root;
            child.$$asyncQueue = parent.$$asyncQueue;
            child.$$postDigestQueue = parent.$$postDigestQueue;
            child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
        } else {
            var ChildScope = function () { };
            ChildScope.prototype = this;
            child = new ChildScope();
        }
        parent.$$children.push(child);
        child.$$watchers = [];
        child.$$listeners = {};
        child.$$children = [];
        child.$parent = parent;
        return child;
    };

    Scope.prototype.$$everyScope = function (fn) {
        if (fn(this)) {
            return this.$$children.every(function (child) {
                return child.$$everyScope(fn);
            });
        } else {
            return false;
        }
    };

    Scope.prototype.$destroy = function () {
        this.$broadcast("$destroy");
        if (this.$parent) {
            var siblings = this.$parent.$$children;
            var indexOfThis = siblings.indexOf(this);
            if (indexOfThis >= 0) {
                siblings.splice(indexOfThis, 1);
            }
        }
        this.$$watchers = null;
        this.$$listeners = {};
    };

    Scope.prototype.$watchCollection = function (watchFn, listenerFn) {
        var self = this;
        var newValue;
        var oldValue;
        var oldLength;
        var veryOldValue;
        var trackVeryOldValue = (listenerFn.length > 1);
        var changeCount = 0;
        var firstRun = true;

        var internalWatchFn = function (scope) {
            var newLength;
            newValue = watchFn(scope);

            if (_.isObject(newValue)) {
                if (_.isArrayLike(newValue)) {
                    if (!_.isArray(oldValue)) {
                        changeCount++;
                        oldValue = [];
                    }
                    if (newValue.length !== oldValue.length) {
                        changeCount++;
                        oldValue.length = newValue.length;
                    }
                    _.forEach(newValue, function (newItem, i) {
                        var bothNaN = _.isNaN(newItem) && _.isNaN(oldValue[i]);
                        if (!bothNaN && newItem !== oldValue[i]) {
                            changeCount++;
                            oldValue[i] = newItem;
                        }
                    });
                } else {
                    if (!_.isObject(oldValue) || _.isArrayLike(oldValue)) {
                        changeCount++;
                        oldValue = {};
                        oldLength = 0;
                    }
                    newLength = 0;
                    _.forOwn(newValue, function (newVal, key) {
                        newLength++;
                        if (oldValue.hasOwnProperty(key)) {
                            var bothNaN = _.isNaN(newVal) && _.isNaN(oldValue[key]);
                            if (!bothNaN && oldValue[key] !== newVal) {
                                changeCount++;
                                oldValue[key] = newVal;
                            }
                        } else {
                            changeCount++;
                            oldLength++;
                            oldValue[key] = newVal;
                        }
                    });
                    //到目前newLength记录newValue里面属性总数
                    //oldLength记录oldValue里面没有的newValue中的属性
                    if (oldLength > newLength) {
                        changeCount++;
                        _.forOwn(oldValue, function (oldVal, key) {
                            if (!newValue.hasOwnProperty(key)) {
                                oldLength--;
                                delete oldValue[key];
                            }
                        });
                    }
                }
            } else {
                if (!self.$$areEqual(newValue, oldValue, false)) {
                    changeCount++;
                }
                oldValue = newValue;
            }

            return changeCount;
        };

        var internalListenerFn = function () {
            if (firstRun) {
                listenerFn(newValue, newValue, self);
                firstRun = false;
            } else {
                listenerFn(newValue, oldValue, self);
            }

            if (trackVeryOldValue) {
                veryOldValue = _.clone(newValue);
            }
        };

        return this.$watch(internalWatchFn, internalListenerFn);
    };

    Scope.prototype.$on = function (eventName, listener) {
        var listeners = this.$$listeners[eventName];
        if (!listeners) {
            this.$$listeners[eventName] = listeners = [];
        }
        listeners.push(listener);
        return function () {
            var index = listeners.indexOf(listener);
            if (index >= 0) {
                listeners[index] = null;
            }
        };
    };

    Scope.prototype.$emit = function (eventName) {
        var propagationStopped = false;
        var event = {
            name: eventName,
            targetScope: this,
            stopPropagation: function () {
                propagationStopped = true;
            },
            preventDefault: function () {
                event.defaultPrevented = true;
            }
        };
        var listenerArgs = [event].concat([].splice.call(arguments, 1));
        var scope = this;
        do {
            event.currentScope = scope;
            scope.$$fireEventOnScope(eventName, listenerArgs);
            scope = scope.$parent;
        } while (scope && !propagationStopped);
        event.currentScope = null;
        return event;
    };

    Scope.prototype.$broadcast = function (eventName) {
        var event = {
            name: eventName,
            targetScope: this,
            preventDefault: function () {
                event.defaultPrevented = true;
            }
        };
        var listenerArgs = [event].concat([].splice.call(arguments, 1));
        this.$$everyScope(function (scope) {
            event.currentScope = scope;
            scope.$$fireEventOnScope(eventName, listenerArgs);
            return true;
        });
        event.currentScope = null;
        return event;
    };

    Scope.prototype.$$fireEventOnScope = function (eventName, listenerArgs) {
        var listeners = this.$$listeners[eventName] || [];
        var i = 0;
        while (i < listeners.length) {
            if (listeners[i] === null) {
                listeners.splice(i, 1);
            } else {
                try {
                    listeners[i].apply(null, listenerArgs);
                } catch (e) {
                    console.log(e);
                }
                i++;
            }
        }
    };

    function initWatchVal() { }

    //Expressions and Filters
    var ESCAPES = {
        'n': '\n',
        'f': '\f',
        'r': '\r',
        't': '\t',
        'v': '\v',
        '\'': '\'',
        '"': '"'
    };
    function Lexer() { }
    Lexer.prototype.lex = function (text) {
        this.text = text;
        this.index = 0;
        this.ch = undefined;
        this.tokens = [];

        while (this.index < this.text.length) {
            this.ch = this.text.charAt(this.index);
            if (this.isNumber(this.ch) || (this.is('.') && this.isNumber(this.peek()))) {
                this.readNumber();
            } else if (this.is('\'"')) {
                this.readString(this.ch);
            } else if (this.is('[],{}:.')) {
                this.tokens.push({
                    text: this.ch
                });
                this.index++;
            } else if (this.isIdent(this.ch)) {
                this.readIdent();
            } else if (this.isWhiteSpace(this.ch)) {
                this.index++;
            } else {
                throw "Unexpexted next character:" + this.ch;
            }
        }

        return this.tokens;
    };
    Lexer.prototype.isNumber = function (ch) {
        return '0' <= ch && ch <= '9';
    };
    Lexer.prototype.isExpOperator = function (ch) {
        return ch === '-' || ch === '+' || this.isNumber(ch);
    };
    Lexer.prototype.isIdent = function (ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
    };
    Lexer.prototype.isWhiteSpace = function (ch) {
        return ch === ' ' || ch === '\r' || ch === '\t' || ch === '\n' || ch === '\v' || ch === '\u0A00';
    };
    Lexer.prototype.readNumber = function () {
        var number = "";
        while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index).toLowerCase();
            if (ch === "." || this.isNumber(ch)) {
                number += ch;
            } else {
                var nextCh = this.peek();
                var prevCh = number.charAt(number.length - 1);
                if (ch === 'e' && this.isExpOperator(nextCh)) {
                    number += ch;
                } else if (this.isExpOperator(ch) && prevCh === 'e' && nextCh && this.isNumber(nextCh)) {
                    number += ch;
                } else if (this.isExpOperator(ch) && prevCh === 'e' && (!nextCh || !this.isNumber(nextCh))) {
                    throw "Invalid exponet";
                } else {
                    break;
                }
            }
            this.index++;
        }
        this.tokens.push({
            text: number,
            value: Number(number)
        });
    };
    Lexer.prototype.readString = function (quote) {
        this.index++;
        var string = "";
        var escape = false;
        while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index);
            if (escape) {
                if (ch === 'u') {
                    var hex = this.text.substring(this.index + 1, this.index + 5);
                    if (!hex.match(/[\da-f]{4}/i)) {
                        throw "Invalid unicode escape";
                    }
                    this.index += 4;
                    string += String.fromCharCode(parseInt(hex, 16));
                } else {
                    var replacement = ESCAPES[ch];
                    if (replacement) {
                        string += replacement;
                    } else {
                        string += ch;
                    }
                }
                escape = false;
            } else if (ch == quote) {
                this.index++;
                this.tokens.push({
                    text: string,
                    value: string
                });
                return;
            } else if (ch === '\\') {
                escape = true;
            } else {
                string += ch;
            }
            this.index++;
        }
        throw "Unmatched quote";
    };
    Lexer.prototype.readIdent = function () {
        var text = "";
        while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index);
            if (this.isIdent(ch) || this.isNumber(ch)) {
                text += ch;
            } else {
                break;
            }
            this.index++;
        }

        var token = {
            text: text,
            identifier: true
        };
        this.tokens.push(token);
    };
    Lexer.prototype.peek = function () {
        return this.index < this.text.length - 1 ? this.text.charAt(this.index + 1) : false;
    };
    Lexer.prototype.is = function (chs) {
        return chs.indexOf(this.ch) >= 0;
    };

    //Abstract Syntax Tree
    function AST(lexer) {
        this.lexer = lexer;
    }
    AST.Program = "Program";
    AST.Literal = "Literal";
    AST.ArrayExpression = "ArrayExpression";
    AST.ObjectExpression = "ObjectExpression";
    AST.Property = "Property";
    AST.Identifier = "Identifier";
    AST.ThisExpression = "ThisExpression";
    AST.MemberExpression = "MemberExpression";
    AST.prototype.constants = {
        "null": { type: AST.Literal, value: null },
        "true": { type: AST.Literal, value: true },
        "false": { type: AST.Literal, value: false },
        "this": { type: AST.ThisExpression }
    };
    AST.prototype.ast = function (text) {
        this.tokens = this.lexer.lex(text);
        return this.program();
    };
    AST.prototype.program = function () {
        return {
            type: AST.Program,
            body: this.primary()
        };
    };
    AST.prototype.primary = function () {
        var primary;
        if (this.expect('[')) {
            primary = this.arrayDeclaration();
        } else if (this.expect('{')) {
            primary = this.object();
        } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
            primary = this.constants[this.consume().text];
        } else if (this.peek().identifier) {
            primary = this.identifier();
        } else {
            primary = this.constant();
        }
        if (this.expect('.')) {
            primary = {
                type: AST.MemberExpression,
                object: primary,
                property: this.identifier()
            };
        }
        return primary;
    };
    AST.prototype.object = function () {
        var properties = [];
        if (!this.peek('}')) {
            do {
                var property = { type: AST.Property };
                if (this.peek().identifier) {
                    property.key = this.identifier();
                } else {
                    property.key = this.constant();
                }
                this.consume(':');
                property.value = this.primary();
                properties.push(property);
            } while (this.expect(','));
        }
        this.consume('}');
        return {
            type: AST.ObjectExpression,
            properties: properties
        };
    };
    AST.prototype.identifier = function () {
        return {
            type: AST.Identifier,
            name: this.consume().text
        };
    };
    //功能和peek相同，附加了将e所在token删除的功能
    AST.prototype.expect = function (e) {
        var token = this.peek(e);
        if (token) {
            return this.tokens.shift();
        }
    };
    AST.prototype.arrayDeclaration = function () {
        var elements = [];
        if (!this.peek(']')) {
            do {
                if (this.peek(']')) {
                    break;
                }
                elements.push(this.primary());
            } while (this.expect(','));
        }
        this.consume(']');
        return {
            type: AST.ArrayExpression,
            elements: elements
        };
    };
    //判断e所在token是否在队头，是的话返回
    AST.prototype.peek = function (e) {
        if (this.tokens.length > 0) {
            var text = this.tokens[0].text;
            if (text === e || !e) {
                return this.tokens[0];
            }
        }
    };
    AST.prototype.consume = function (e) {
        var token = this.expect(e);
        if (!token) {
            throw "Unexpected Expecting: " + e;
        }
        return token;
    };
    AST.prototype.constant = function () {
        return {
            type: AST.Literal,
            value: this.consume().value
        };
    };

    function ASTCompiler(astBuilder) {
        this.astBuilder = astBuilder;
    }
    ASTCompiler.prototype.compile = function (text) {
        var ast = this.astBuilder.ast(text);
        this.state = {
            body: [],
            nextId: 0,
            vars: []
        };
        this.recurse(ast);
        return new Function('s', (this.state.vars.length ? 'var ' + this.state.vars.join(',') + ';' : '') + this.state.body.join(''));
    };
    ASTCompiler.prototype.recurse = function (ast) {
        var intoId;
        var _this = this;
        switch (ast.type) {
            case AST.Program:
                this.state.body.push("return ", this.recurse(ast.body), ';');
                break;
            case AST.Literal:
                return this.escape(ast.value);
            case AST.ArrayExpression:
                var elements = _.map(ast.elements, function (element) {
                    return _this.recurse(element);
                });
                return "[" + elements.join(',') + "]";
            case AST.ObjectExpression:
                var properties = _.map(ast.properties, function (property) {
                    var key = property.key.type === AST.Identifier ? property.key.name : this.escape(property.key.value);
                    var value = _this.recurse(property.value);
                    return key + ':' + value;
                });
                return "{" + properties.join(',') + "}";
            case AST.Identifier:
                intoId = this.nextId();
                this.if_('s', this.assign(intoId, this.nonComputedMember('s', ast.name)));
                return intoId;
            case AST.ThisExpression:
                return 's';
            case AST.MemberExpression:
                intoId = this.nextId();
                var left = this.recurse(ast.object);
                this.if_(left, this.assign(intoId, this.nonComputedMember(left, ast.property.name)));
                return intoId;
        }
    };
    ASTCompiler.prototype.escape = function (value) {
        if (_.isString(value)) {
            return '\'' + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';
        } else if (_.isNull(value)) {
            return "null";
        } else {
            return value;
        }
    };
    ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;//注意有一个空格
    ASTCompiler.prototype.stringEscapeFn = function (c) {
        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    };
    ASTCompiler.prototype.nonComputedMember = function (left, right) {
        return '(' + left + ').' + right;
    };
    ASTCompiler.prototype.if_ = function (test, consequent) {
        this.state.body.push('if(', test, '){', consequent, '}');
    };
    ASTCompiler.prototype.assign = function (id, value) {
        return id + '=' + value + ';';
    };
    ASTCompiler.prototype.nextId = function () {
        var id = 'v' + (this.state.nextId++);
        this.state.vars.push(id);
        return id;
    };

    function Parser(lexer) {
        this.lexer = lexer;
        this.ast = new AST(this.lexer);
        this.astCompiler = new ASTCompiler(this.ast);
    }
    Parser.prototype.parse = function (text) {
        return this.astCompiler.compile(text);
    };

    function parse(expr) {
        var lexer = new Lexer();
        var parser = new Parser(lexer);
        return parser.parse(expr);
    }

    window.parse = parse;
    window.Scope = Scope;
})();
