(function () {
    function $RootScopeProvider() {
        var TTL = 10;
        this.digestTtl = function (value) {
            if (_.isNumber(value)) {
                TTL = value;
            }
            return TTL;
        };
        this.$get = ["$parse", function ($parse) {
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

                watchFn = $parse(watchFn);
                if (watchFn.$$watchDelegate) {
                    return watchFn.$$watchDelegate(self, listenerFn, valueEq, watchFn);
                }

                var watcher = {
                    watchFn: watchFn,
                    listenerFn: listenerFn || function () {
                    },
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
                var ttl = TTL;//ttl means Time To Live
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
                        throw TTL + " digest iterations reached";
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
                return $parse(expr)(this, locals);
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
                    var ChildScope = function () {
                    };
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

                watchFn = $parse(watchFn);

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

            function initWatchVal() {
            }

            var $rootScope = new Scope();
            return $rootScope;
        }];
    }
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

    var OPERATORS = {
        '+': true,
        '!': true,
        '-': true,
        '*': true,
        '/': true,
        '%': true,
        '=': true,
        '==': true,
        '!=': true,
        '===': true,
        '!==': true,
        '<': true,
        '>': true,
        '<=': true,
        '>=': true,
        '&&': true,
        '||': true,
        '|': true
    };

    function Lexer() {
    }

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
            } else if (this.is('[],{}:.()?;')) {
                this.tokens.push({
                    text: this.ch
                });
                this.index++;
            } else if (this.isIdent(this.ch)) {
                this.readIdent();
            } else if (this.isWhiteSpace(this.ch)) {
                this.index++;
            } else {
                var ch = this.ch;
                var ch2 = this.ch + this.peek();
                var ch3 = this.ch + this.peek() + this.peek(2);
                var op = OPERATORS[ch];
                var op2 = OPERATORS[ch2];
                var op3 = OPERATORS[ch3];
                if (op || op2 || op3) {
                    var token = op3 ? ch3 : (op2 ? ch2 : ch);
                    this.tokens.push({ text: token });
                    this.index += token.length;
                } else {
                    throw "Unexpexted next character:" + this.ch;
                }
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
        var rawString = quote;
        var escape = false;
        while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index);
            rawString += ch;
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
                    text: rawString,
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
    Lexer.prototype.peek = function (n) {
        n = n || 1;
        return this.index + n < this.text.length ? this.text.charAt(this.index + n) : false;
    };
    Lexer.prototype.is = function (chs) {
        return chs.indexOf(this.ch) >= 0;
    };

    //不可以在表达式中使用call apply bind
    var CALL = Function.prototype.call;
    var APPLY = Function.prototype.apply;
    var BIND = Function.prototype.bind;

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
    AST.CallExpression = "CallExpression";
    AST.AssignmentExpression = "AssignmentExpression";
    AST.UnaryExpression = "UnaryExpression";
    AST.BinaryExpression = "BinaryExpression";
    AST.LogicalExpression = "LogicalExpression";
    AST.ConditionalExpression = "ConditionalExptession";
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
    AST.prototype.assignment = function () {
        var left = this.ternary();
        if (this.expect("=")) {
            var right = this.ternary();
            return {
                type: AST.AssignmentExpression,
                left: left,
                right: right
            };
        }
        return left;
    };
    AST.prototype.program = function () {
        var body = [];
        while (true) {
            if (this.tokens.length) {
                body.push(this.filter());
            }
            if (!this.expect(';')) {
                return {
                    type: AST.Program,
                    body: body
                };
            }
        }
    };
    AST.prototype.primary = function () {
        var primary;
        if (this.expect('(')) {
            primary = this.filter();
            this.consume(')');
        } else if (this.expect('[')) {
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
        var next;
        while (next = this.expect('.', '[', '(')) {
            if (next.text === '[') {
                primary = {
                    type: AST.MemberExpression,
                    object: primary,
                    property: this.primary(),
                    computed: true
                };
                this.consume(']');
            } else if (next.text === '.') {
                primary = {
                    type: AST.MemberExpression,
                    object: primary,
                    property: this.identifier(),
                    computed: false
                };
            } else if (next.text === '(') {
                primary = {
                    type: AST.CallExpression,
                    callee: primary,
                    arguments: this.parseArguments()
                };
                this.consume(')');
            }
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
                property.value = this.assignment();
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
    AST.prototype.expect = function (e1, e2, e3, e4) {
        var token = this.peek(e1, e2, e3, e4);
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
                elements.push(this.assignment());
            } while (this.expect(','));
        }
        this.consume(']');
        return {
            type: AST.ArrayExpression,
            elements: elements
        };
    };
    //判断e所在token是否在队头，是的话返回
    AST.prototype.peek = function (e1, e2, e3, e4) {
        if (this.tokens.length > 0) {
            var text = this.tokens[0].text;
            if (text === e1 || text === e2 || text === e3 || text === e4 || (!e1 && !e2 && !e3 && !e4)) {
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
    AST.prototype.parseArguments = function () {
        var args = [];
        if (!this.peek(')')) {
            do {
                args.push(this.assignment());
            } while (this.expect(','));
        }
        return args;
    };
    AST.prototype.unary = function () {
        var token;
        if (token = this.expect('+', '!', '-')) {
            return {
                type: AST.UnaryExpression,
                operator: token.text,
                argument: this.unary()
            };
        } else {
            return this.primary();
        }
    };
    AST.prototype.multiplicative = function () {
        var left = this.unary();
        var token;
        while ((token = this.expect('*', '/', '%'))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.unary()
            };
        }
        return left;
    };
    AST.prototype.additive = function () {
        var left = this.multiplicative();
        var token;
        while ((token = this.expect('+')) || (token = this.expect('-'))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.multiplicative()
            };
        }
        return left;
    };
    AST.prototype.equality = function () {
        var left = this.relational();
        var token;
        while ((token = this.expect('==', '!=', '===', '!=='))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.relational()
            };
        }
        return left;
    };
    AST.prototype.relational = function () {
        var left = this.additive();
        var token;
        while ((token = this.expect('<', '>', '<=', '>='))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.additive()
            };
        }
        return left;
    };
    AST.prototype.logicalOR = function () {
        var left = this.logicalAND();
        var token;
        while ((token = this.expect("||"))) {
            left = {
                type: AST.LogicalExpression,
                left: left,
                operator: token.text,
                right: this.logicalAND()
            };
        }
        return left;
    };
    AST.prototype.logicalAND = function () {
        var left = this.equality();
        var token;
        while ((token = this.expect("&&"))) {
            left = {
                type: AST.LogicalExpression,
                left: left,
                operator: token.text,
                right: this.equality
            };
        }
        return left;
    };
    AST.prototype.ternary = function () {
        var test = this.logicalOR();
        if (this.expect('?')) {
            var consequent = this.assignment();
            if (this.consume(':')) {
                var alternate = this.assignment();
                return {
                    type: AST.ConditionalExpression,
                    test: test,
                    consequent: consequent,
                    alternate: alternate
                };
            }
        }
        return test;
    };
    AST.prototype.filter = function () {
        var left = this.assignment();
        while (this.expect('|')) {
            var args = [left];
            left = {
                type: AST.CallExpression,
                callee: this.identifier(),
                arguments: args,
                filter: true
            };
            while (this.expect(':')) {
                args.push(this.assignment());
            }
        }
        return left;
    };

    function ASTCompiler(astBuilder, $filter) {
        this.astBuilder = astBuilder;
        this.$filter = $filter;
    }

    ASTCompiler.prototype.compile = function (text) {
        var ast = this.astBuilder.ast(text);
        var extra = "";
        var _this = this;
        markConstantAndWatchExpressions(ast, this.$filter);
        this.state = {
            nextId: 0,
            fn: { body: [], vars: [] },
            filters: {},
            assign: { body: [], vars: [] },
            inputs: []
        };
        this.stage = "inputs";
        _.forEach(getInputs(ast.body), function (input, idx) {
            var inputKey = "fn" + idx;
            _this.state[inputKey] = { body: [], vars: [] };
            _this.state.computing = inputKey;
            _this.state[inputKey].body.push("return " + _this.recurse(input) + ";");
            _this.state.inputs.push(inputKey);
        });
        this.stage = "assign";
        var assignable = assignableAST(ast);
        if (assignable) {
            this.state.computing = "assign";
            this.state.assign.body.push(this.recurse(assignable));
            extra = "fn.assign=function(s,v,l){" +
                (this.state.assign.vars.length ? "var " + this.state.assign.vars.join(",") + ";" : "") +
                this.state.assign.body.join("") +
                "};";
        }
        this.stage = "main";
        this.state.computing = "fn";
        this.recurse(ast);
        var fnString = this.filterPrefix() +
            "var fn=function(s,l){" +
            (this.state.fn.vars.length ? "var " + this.state.fn.vars.join(',') + ';' : '') +
            this.state.fn.body.join('') +
            "};" + this.watchFns() + extra + " return fn;";
        var fn = new Function(
            "ensureSafeMemberName",
            "ensureSafeObject",
            "ensureSafeFunction",
            "ifDefined",
            "filter",
            fnString)(
            ensureSafeMemberName,
            ensureSafeObject,
            ensureSafeFunction,
            ifDefined,
            this.$filter);
        fn.literal = isLiteral(ast);
        fn.constant = ast.constant;
        return fn;
    };
    ASTCompiler.prototype.recurse = function (ast, context, create) {
        var intoId;
        var _this = this;
        switch (ast.type) {
            case AST.Program:
                _.forEach(_.initial(ast.body), function (stmt) {
                    _this.state[this.state.computing].body.push(_this.recurse(stmt), ';');
                });
                this.state[this.state.computing].body.push("return ", this.recurse(_.last(ast.body)), ';');
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
                ensureSafeMemberName(ast.name);
                intoId = this.nextId();
                var localsCheck;
                if (this.stage === "inputs") {
                    localsCheck = "false";
                } else {
                    localsCheck = this.getHasOwnProperty("l", ast.name);
                }
                this.if_(localsCheck, this.assign(intoId, this.nonComputedMember('l', ast.name)));
                if (create) {
                    this.if_(this.not(localsCheck) + ' && s && ' + this.not(localsCheck), this.assign(this.nonComputedMember('s', ast.name), '{}'));
                }
                this.if_(this.not(this.getHasOwnProperty('l', ast.name)) + ' && s', this.assign(intoId, this.nonComputedMember('s', ast.name)));
                if (context) {
                    context.context = localsCheck + '?l:s';
                    context.name = ast.name;
                    context.computed = false;
                }
                this.addEnsureSafeObject(intoId);
                return intoId;
            case AST.ThisExpression:
                return 's';
            case AST.MemberExpression:
                intoId = this.nextId();
                var left = this.recurse(ast.object, undefined, create);
                if (context) {
                    context.context = left;
                }
                if (ast.computed) {
                    var right = this.recurse(ast.property);
                    this.addEnsureSafeMemberName(right);
                    if (create) {
                        this.if_(this.not(this.computedMember(left, right)),
                            this.assign(this.computedMember(left, right), "{}"));
                    }
                    this.if_(left, this.assign(intoId, "ensureSafeObject(" + this.computedMember(left, right) + ")"));
                    if (context) {
                        context.name = right;
                        context.computed = true;
                    }
                } else {
                    ensureSafeMemberName(ast.property.name);
                    if (create) {
                        this.if_(this.not(this.nonComputedMember(left, ast.property.name)),
                            this.assign(this.nonComputedMember(left, ast.property.name), "{}"));
                    }
                    this.if_(left, this.assign(intoId, "ensureSafeObject(" + this.nonComputedMember(left, ast.property.name) + ")"));
                    if (context) {
                        context.name = ast.property.name;
                        context.computed = false;
                    }
                }
                return intoId;
            case AST.CallExpression:
                var callContext;
                var callee;
                var args;
                var _this = this;
                if (ast.filter) {
                    callee = this.filter(ast.callee.name);
                    args = _.map(ast.arguments, function (arg) {
                        return _this.recurse(arg);
                    });
                    return callee + '(' + args + ')';
                } else {
                    callContext = {};
                    callee = this.recurse(ast.callee, callContext);
                    args = _.map(ast.arguments, function (arg) {
                        return "ensureSafeObject(" + _this.recurse(arg) + ")";
                    });
                    if (callContext.name) {
                        this.addEnsureSafeObject(callContext.context);
                        if (callContext.computed) {
                            callee = this.computedMember(callContext.context, callContext.name);
                        } else {
                            callee = this.nonComputedMember(callContext.context, callContext.name);
                        }
                    }
                    this.addEnsureSafeFunction(callee);
                    return callee + '&&ensureSafeObject(' + callee + '(' + args.join(',') + '))';
                }
                break;
            case AST.AssignmentExpression:
                var leftContext = {};
                this.recurse(ast.left, leftContext, true);
                var leftExpr;
                if (leftContext.computed) {
                    leftExpr = this.computedMember(leftContext.context, leftContext.name);
                } else {
                    leftExpr = this.nonComputedMember(leftContext.context, leftContext.name);
                }
                return this.assign(leftExpr, "ensureSafeObject(" + this.recurse(ast.right) + ")");
            case AST.UnaryExpression:
                return ast.operator + '(' + this.ifDefined(this.recurse(ast.argument), 0) + ')';
            case AST.BinaryExpression:
                if (ast.operator === '+' || ast.operator === '-') {
                    return '(' + this.ifDefined(this.recurse(ast.left), 0) + ')' +
                        ast.operator +
                        '(' + this.ifDefined(this.recurse(ast.right), 0) + ')';
                } else {
                    return '(' + this.recurse(ast.left) + ')' +
                        ast.operator +
                        '(' + this.recurse(ast.right) + ')';
                }
            case AST.LogicalExpression:
                intoId = this.nextId();
                this.state[this.state.computing].body.push(this.assign(intoId, this.recurse(ast.left)));
                this.if_(ast.operator === "&&" ? intoId : this.not(intoId), this.assign(intoId, this.recurse(ast.right)));
                return intoId;
            case AST.ConditionalExpression:
                intoId = this.nextId();
                var testId = this.nextId();
                this.state[this.state.computing].body.push(this.assign(testId, this.recurse(ast.test)));
                this.if_(testId, this.assign(intoId, this.recurse(ast.consequent)));
                this.if_(this.not(testId), this.assign(intoId, this.recurse(ast.alternate)));
                return intoId;
            case AST.NGValueParameter:
                return "v";
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
    ASTCompiler.prototype.computedMember = function (left, right) {
        return '(' + left + ')[' + right + ']';
    };
    ASTCompiler.prototype.if_ = function (test, consequent) {
        this.state[this.state.computing].body.push('if(', test, '){', consequent, '}');
    };
    ASTCompiler.prototype.assign = function (id, value) {
        return id + '=' + value + ';';
    };
    ASTCompiler.prototype.nextId = function (skip) {
        var id = 'v' + (this.state.nextId++);
        if (!skip) {
            this.state[this.state.computing].vars.push(id);
        }
        return id;
    };
    ASTCompiler.prototype.not = function (e) {
        return '!(' + e + ')';
    };
    ASTCompiler.prototype.getHasOwnProperty = function (object, property) {
        return object + '&&(' + this.escape(property) + ' in ' + object + ')';
    };
    ASTCompiler.prototype.addEnsureSafeMemberName = function (expr) {
        this.state[this.state.computing].body.push("ensureSafeMemberName(" + expr + ");");
    };
    ASTCompiler.prototype.addEnsureSafeObject = function (expr) {
        this.state[this.state.computing].body.push("ensureSafeObject(" + expr + ");");
    };
    ASTCompiler.prototype.addEnsureSafeFunction = function (expr) {
        this.state[this.state.computing].body.push("ensureSafeFunction(" + expr + ");");
    };
    ASTCompiler.prototype.ifDefined = function (value, defaultValue) {
        return "ifDefined(" + value + ',' + this.escape(defaultValue) + ')';
    };
    ASTCompiler.prototype.filter = function (name) {
        if (!this.state.filters.hasOwnProperty("name")) {
            this.state.filters[name] = this.nextId(true);
        }
        return this.state.filters[name];
    };
    ASTCompiler.prototype.filterPrefix = function () {
        var _this = this;
        if (_.isEmpty(this.state.filters)) {
            return "";
        } else {
            var parts = _.map(this.state.filters, function (varName, filterName) {
                return varName + "=" + "filter(" + _this.escape(filterName) + ')';
            });
            return "var " + parts.join(',') + ";";
        }
    };
    ASTCompiler.prototype.watchFns = function () {
        var result = [];
        var _this = this;
        _.forEach(this.state.inputs, function (inputName) {
            result.push("var ", inputName, "=function(s){",
                (_this.state[inputName].vars.length ? "var " + _this.state[inputName].vars.join(",") + ";" : ""),
                _this.state[inputName].body.join(""),
                "};");
        });
        if (result.length) {
            result.push("fn.inputs=['", this.state.inputs.join(","), "];");
        }
        return result.join("");
    };

    function Parser(lexer, $filter) {
        this.lexer = lexer;
        this.ast = new AST(this.lexer);
        this.astCompiler = new ASTCompiler(this.ast, $filter);
    }

    Parser.prototype.parse = function (text) {
        return this.astCompiler.compile(text);
    };

    function getInputs(ast) {
        if (ast.length !== 1) {
            return;
        }
        var candidate = ast[0].toWatch;
        if (candidate.length !== 1 || candidate[0] !== ast[0]) {
            return candidate;
        }
    }

    function isAssignable(ast) {
        return ast.type === AST.Identifier || ast.type == AST.MemberExpression;
    }

    function assignableAST(ast) {
        if (ast.body.length == 1 && isAssignable(ast.body[0])) {
            return {
                type: AST.AssignmentExpression,
                left: ast.body[0],
                right: { type: AST.NGValueParameter }
            };
        }
    }

    function $ParseProvider() {
        this.$get = ["$filter", function ($filter) {
            return function (expr) {
                switch (typeof expr) {
                    case "string":
                        var lexer = new Lexer();
                        var parser = new Parser(lexer, $filter);
                        var oneTime = false;
                        if (expr.charAt(0) === ":" && expr.charAt(1) === ":") {
                            oneTime = true;
                            expr = expr.substring(2);
                        }
                        var parseFn = parser.parse(expr);
                        if (parseFn.constant) {
                            parseFn.$$watchDelegate = constantWhichDelegate;
                        } else if (oneTime) {
                            parseFn.$$watchDelegate = parseFn.literal ? oneTimeLiteralWatchDelegate : oneTimeWatchDelegate;
                        } else if (parseFn.inputs) {
                            parseFn.$$watchDelegate = inputsWatchDelegate;
                        }
                        return parseFn;
                    case "function":
                        return expr;
                    default:
                        return _.noop;
                }
            };
        }];
    }

    function inputsWatchDelegate(scope, listenerFn, valueEq, watchFn) {
        var inputExpressions = watchFn.inputs;
        var oldValues = _.times(inputExpressions.length, _.constant(function () { }));
        var lastResult;
        return scope.$watch(function () {
            var changed = false;
            _.forEach(inputExpressions, function (inputExpr, i) {
                var newValue = inputExpr(scope);
                if (changed || !expressionInputDirtyCheck(newValue, oldValues[i])) {
                    changed = true;
                    oldValues[i] = newValue;
                }
            });
            if (changed) {
                lastResult = watchFn(scope);
            }
        }, listenerFn, valueEq);
    }

    function expressionInputDirtyCheck(newValue, oldValue) {
        return newValue === oldValue || (typeof newValue === "number" && typeof oldValue === "number" && isNaN(newValue) && isNaN(oldValue));
    }

    function oneTimeWatchDelegate(scope, listenerFn, valueEq, watchFn) {
        var lastValue;
        var unwatch = scope.$watch(
                function () {
                    return watchFn(scope);
                },
                function (newValue, oldValue, scope) {
                    lastValue = newValue;
                    if (_.isFunction(listenerFn)) {
                        listenerFn.apply(this, arguments);
                    }
                    if (!_.isUndefined(newValue)) {
                        scope.$$postDigest(function () {
                            if (!_.isUndefined(lastValue)) {
                                unwatch();
                            }
                        });
                    }
                },
                valueEq
            );
        return unwatch;
    }

    function oneTimeLiteralWatchDelegate(scope, listenerFn, valueEq, watchFn) {
        function isAllDefined(val) {
            return !_.any(val, _.isUndefined);
        }
        var unwatch = scope.$watch(
                function () {
                    return watchFn(scope);
                },
                function (newValue, oldValue, scope) {
                    if (_.isFunction(listenerFn)) {
                        listenerFn.apply(this.arguments);
                    }
                    if (isAllDefined(newValue)) {
                        scope.$$postDigest(function () {
                            if (isAllDefined(newValue)) {
                                unwatch();
                            }
                        });
                    }
                }
            );
    }

    function constantWatchDelegate(scope, listenerFn, valueEq, watchFn) {
        var unwatch = scope.$watch(
                function () {
                    return watchFn(scope);
                },
                function (newValue, oldValue, scope) {
                    if (_.isFunction(listenerFn)) {
                        listenerFn.apply(this, arguments);
                    }
                    unwatch();
                },
                valueEq
            );
        return unwatch;
    }

    function ensureSafeMemberName(name) {
        if (name === "constructor" || name === "__proto__" ||
            name === "__defineGetter__" || name === "__defineSetter__" ||
            name === "__lookupGetter__" || name === "__lookupSetter__") {
            throw "Attempting to access a disallowed field in angular expressions!";
        }
    }

    function ensureSafeObject(obj) {
        if (obj) {
            if (obj.document && obj.location && obj.alert && obj.setInterval) {
                throw "Referencing window in Angular expression is disallowed!";
            } else if (obj.children && (obj.nodeName || (obj.prop && obj.attr && obj.find))) {
                throw "Referencing DOM nodes in Angular expressions is disallowed!";
            } else if (obj.constructor === obj) {
                throw "Referencing Function in Angular expressions is disallowed";
            } else if (obj.getOwnPropertyNames || obj.getOwnPropertyDescriptor) {
                throw "Referencing Object in Angular expressions is disallowed";
            }
        }
        return obj;
    }

    function ensureSafeFunction(obj) {
        if (obj) {
            if (obj.constructor === obj) {
                throw "Referencing Function in Angular expressions is disallowed!"
            } else if (obj === CALL || obj === APPLY || obj === BIND) {
                throw "Referencing call,apply,or bind in Angular Expressions is disallowed";
            }
        }
        return obj;
    }

    function ifDefined(value, defaultValue) {
        return typeof value === 'undefined' ? defaultValue : value;
    }

    function isLiteral(ast) {
        return ast.body.length === 0 ||
            ast.body.length === 1 && (
            ast.body[0].type === AST.Literal ||
            ast.body[0].type === AST.ArrayExpression ||
            ast.body[0].type === AST.ObjectExpression
            );
    }

    function markConstantAndWatchExpressions(ast, $filter) {
        var allConstants;
        var argsToWatch;
        switch (ast.type) {
            case AST.Program:
                allConstants = true;
                _.forEach(ast.body, function (expr) {
                    markConstantAndWatchExpressions(expr, $filter);
                    allConstants = allConstants && expr.constant;
                });
                ast.constant = allConstants;
                break;
            case AST.Literal:
                ast.constant = true;
                ast.toWatch = [];
                break;
            case AST.Identifier:
                ast.constant = false;
                ast.toWatch = [ast];
                break;
            case AST.ArrayExpression:
                allConstants = true;
                argsToWatch = [];
                _.forEach(ast.elements, function (element) {
                    markConstantAndWatchExpressions(element, $filter);
                    allConstants = allConstants && element.constant;
                    if (!element.constant) {
                        argsToWatch.push.apply(argsToWatch, element.toWatch);
                    }
                });
                ast.constant = allConstants;
                ast.toWatch = argsToWatch;
                break;
            case AST.ObjectExpression:
                allConstants = true;
                argsToWatch = [];
                _.forEach(ast.properties, function (property) {
                    markConstantAndWatchExpressions(property.value, $filter);
                    allConstants = allConstants && property.value.constant;
                    if (!property.value.constant) {
                        argsToWatch.push.apply(argsToWatch, property.value.toWatch);
                    }
                });
                ast.constant = allConstants;
                ast.toWatch = argsToWatch;
                break;
            case AST.ThisExpression:
                ast.constant = false;
                ast.toWatch = [];
                break;
            case AST.MemberExpression:
                markConstantAndWatchExpressions(ast.object, $filter);
                if (ast.computed) {
                    markConstantAndWatchExpressions(ast.property, $filter);
                }
                ast.constant = ast.object.constant && (!ast.computed || ast.property.constant);
                ast.toWatch = [ast];
                break;
            case AST.CallExpression:
                var stateless = ast.filter && !$filter(ast.callee.name).$stateful;
                allConstants = stateless ? true : false;
                argsToWatch = [];
                _.forEach(ast.arguments, function (arg) {
                    markConstantAndWatchExpressions(arg, $filter);
                    allConstants = allConstants && arg.constant;
                    if (!arg.constant) {
                        argsToWatch.push.apply(argsToWatch, arg.toWatch);
                    }
                });
                ast.constant = allConstants;
                ast.toWatch = stateless ? argsToWatch : [ast];
                break;
            case AST.AssignmentExpression:
                markConstantAndWatchExpressions(ast.left, $filter);
                markConstantAndWatchExpressions(ast.right, $filter);
                ast.constant = ast.left.constant && ast.right.constant;
                ast.toWatch = [ast];
                break;
            case AST.UnaryExpression:
                markConstantAndWatchExpressions(ast.argument, $filter);
                ast.constant = ast.argument.constant;
                ast.toWatch = ast.argument.toWatch;
                break;
            case AST.BinaryExpression:
                markConstantAndWatchExpressions(ast.left, $filter);
                markConstantAndWatchExpressions(ast.right, $filter);
                ast.constant = ast.left.constant && ast.right.constant;
                ast.toWatch = ast.left.toWatch.concat(ast.right.toWatch);
                break;
            case AST.LogicalExpression:
                markConstantAndWatchExpressions(ast.left, $filter);
                markConstantAndWatchExpressions(ast.right, $filter);
                ast.constant = ast.left.constant && ast.right.constant;
                ast.toWatch = [ast];
                break;
            case AST.ConditionalExpression:
                markConstantAndWatchExpressions(ast.test, $filter);
                markConstantAndWatchExpressions(ast.consequent, $filter);
                markConstantAndWatchExpressions(ast.alternate, $filter);
                ast.constant = ast.test.constant && ast.consequent.constant && ast.alternate.constant;
                ast.toWatch = [ast];
                break;
        }
    }

    function $FilterProvider($provide) {
        //filters
        var filters = {};

        this.register = function (name, factory) {
            if (_.isObject(name)) {
                return _.map(name, function (factory, name) {
                    return this.register(name, factory);
                }, this);
            } else {
                return $provide.factory(name + "Filter", factory);
            }
        };

        this.$get = ["$injector", function ($injector) {
            return function filter(name) {
                return $injector.get(name + "Filter");
            };
        }];

        this.register("filter", filterFilter);
    }
    $FilterProvider.$inject = ["$provide"];
    function filterFilter() {
        return function (array, filterExpr, comparator) {
            var predicateFn;
            if (_.isFunction(filterExpr)) {
                predicateFn = filterExpr;
            } else if (_.isString(filterExpr) ||
                _.isNumber(filterExpr) ||
                _.isBoolean(filterExpr) ||
                _.isNull(filterExpr) ||
                _.isObject(filterExpr)) {
                predicateFn = createPredicateFn(filterExpr, comparator);
            } else {
                return array;
            }
            return _.filter(array, predicateFn);
        };
    }

    function createPredicateFn(expression, comparator) {
        var shouldMatchPrimitives = _.isObject(expression) && ("$" in expression);
        if (comparator === true) {
            comparator = _.isEqual;
        } else if (!_.isFunction(comparator)) {
            comparator = function (actual, expected) {
                if (_.isUndefined(actual)) {
                    return false;
                }
                if (_.isNull(actual) || _.isNull(expected)) {
                    return actual === expected;
                }
                actual = ("" + actual).toLowerCase();
                expected = ("" + expected).toLowerCase();
                return actual.indexOf(expected) !== -1;
            };
        }

        return function predicateFn(item) {
            if (shouldMatchPrimitives && !_.isObject(item)) {
                return deepCompare(item, expression.$, comparator);
            }
            return deepCompare(item, expression, comparator, true);
        };
    }

    function deepCompare(actual, expected, comparator, matchAnyProperty, inWildCard) {
        if (_.isString(expected) && _.startsWith(expected, "!")) {
            return !deepCompare(actual, expected.substring(1), comparator, matchAnyProperty);
        }
        if (_.isArray(actual)) {
            return _.any(actual, function (actualItem) {
                return deepCompare(actualItem, expected, comparator, matchAnyProperty);
            });
        }
        if (_.isObject(actual)) {
            if (_.isObject(expected) && !inWildCard) {
                return _.every(
                        _.toPlainObject(expected),
                        function (expectedVal, expectedKey) {
                            if (_.isUndefined(expectedVal)) {
                                return true;
                            }
                            var isWildCard = (expectedKey === "$");
                            var actualVal = isWildCard ? actual : actual[expectedKey];
                            return deepCompare(actual[expectedKey], expectedVal, comparator, isWildCard, isWildCard);
                        }
                    );
            } else if (matchAnyProperty) {
                return _.some(actual, function (value) {
                    return deepCompare(value, expected, comparator, matchAnyProperty);
                });
            } else {
                return comparator(actual, expected);
            }
        } else {
            return comparator(actual, expected);
        }
    }

    //register("filter", filterFilter);

    //Modules
    var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
    var FN_ARG = /^\s*(_?)(\S+)\1\s*$/;
    var STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/mg;
    //注：里面的问号起到了惰性匹配的作用，当匹配 a,/*b,*/c/*,d*/ 这种有多段注释的参数列表时不会将/*b,*/c/*,d*/匹配而是分别匹配/*b,*/和/*,d*/
    var INSTANTIATING = {};

    function setupModuleLoader(window) {
        var ensure = function (obj, name, factory) {
            return obj[name] || (obj[name] = factory());
        };
        var angular = ensure(window, "angular", Object);

        var createModule = function (name, requires, modules, configFn) {
            if (name === "hasOwnProperty") {
                throw "hasOwnProperty is not a valid module name";
            }
            var invokeQueue = [];
            var configBlocks = [];

            var invokeLater = function (service, method, arrayMethod, queue) {
                return function () {
                    queue = queue || invokeQueue;
                    queue[arrayMethod || "push"]([service, method, arguments]);
                    return moduleInstance;
                };
            };

            var moduleInstance = {
                name: name,
                requires: requires,
                constant: invokeLater("$provide", "constant", "unshift"),
                provider: invokeLater("$provide", "provider"),
                factory: invokeLater("$provide", "factory"),
                value: invokeLater("$provide", "value"),
                service: invokeLater("$provide", "service"),
                decorator: invokeLater("$provide", "decorator"),
                filter: invokeLater("$filterProvider", "register"),
                directive: invokeLater("$compileProvider", "directive"),
                config: invokeLater("$injector", "invoke", "push", configBlocks),
                run: function (fn) {
                    moduleInstance._runBlocks.push(fn);
                    return moduleInstance;
                },
                _invokeQueue: invokeQueue,
                _configBlocks: configBlocks,
                _runBlocks: []
            };

            if (configFn) {
                moduleInstance.config(configFn);
            }
            modules[name] = moduleInstance;
            return moduleInstance;
        };

        var getModule = function (name, modules) {
            if (modules.hasOwnProperty(name)) {
                return modules[name];
            } else {
                throw "Module " + name + " is not available";
            }
        };

        ensure(angular, "module", function () {
            var modules = {};
            return function (name, requires, configFn) {
                if (requires) {
                    return createModule(name, requires, modules, configFn);
                } else {
                    return getModule(name, modules);
                }
            };
        });
    }
    function createInjector(modulesToLoad, strictDi) {
        var providerCache = {};
        var providerInjector = providerCache.$injector = createInternalInjector(providerCache, function () {
            throw "Unknown provider: " + path.join("<-");
        });
        var instanceCache = {};
        var instanceInjector = instanceCache.$injector = createInternalInjector(instanceCache, function (name) {
            var provider = providerInjector.get(name + "Provider");
            return instanceInjector.invoke(provider.$get, provider);
        });
        var loadedModules = new HashMap();
        var path = [];
        strictDi = (strictDi === true);
        function enforceReturnValue(factoryFn) {
            return function () {
                var value = instanceInjector.invoke(factoryFn);
                if (_.isUndefined(value)) {
                    throw "factory must return a value";
                }
                return value;
            };
        }
        providerCache.$provide = {
            constant: function (key, value) {
                if (key === "hasOwnProperty") {
                    throw "hasOwnProperty is not a valid constant name!";
                }
                providerCache[key] = value;
                instanceCache[key] = value;
            },
            provider: function (key, provider) {
                if (_.isFunction(provider)) {
                    provider = providerInjector.instantiate(provider);
                }
                providerCache[key + "Provider"] = provider;
            },
            factory: function (key, factoryFn, enforce) {
                this.provider(key, {
                    $get: enforce === false ? factoryFn : enforceReturnValue(factoryFn)
                });
            },
            value: function (key, value) {
                this.factory(key, _.constant(value));
            },
            service: function (key, Constructor) {
                this.factory(key, function () {
                    return instanceInjector.instantiate(Constructor);
                });
            },
            decorator: function (serviceName, decoratorFn) {
                var provider = providerInjector.get(serviceName + "Provider");
                var original$get = provider.$get;
                provider.$get = function () {
                    var instance = instanceInjector.invoke(original$get, provider);
                    instanceInjector.invoke(decoratorFn, null, { $delegate: instance });
                    return instance;
                };
            }
        };

        function annotate(fn) {
            if (_.isArray(fn)) {
                return fn.slice(0, fn.length - 1);
            } else if (fn.$inject) {
                return fn.$inject;
            } else if (!fn.length) {
                return [];
            } else {
                if (strictDi) {
                    throw "fn is not using explicit annotation and can't be invoked in strict mode";
                }
                var source = fn.toString().replace(STRIP_COMMENTS, "");
                var argDeclaration = source.match(FN_ARGS);
                return _.map(argDeclaration[1].split(","), function (argName) {
                    return argName.match(FN_ARG)[2];
                });
            }
        }

        function createInternalInjector(cache, factoryFn) {
            function getService(name) {
                if (cache.hasOwnProperty(name)) {
                    if (cache[name] === INSTANTIATING) {
                        throw new Error("Circular dependency found: " + name + "<-" + path.join("<-"));
                    }
                    return cache[name];
                } else {
                    path.unshift(name);
                    cache[name] = INSTANTIATING;
                    try {
                        return cache[name] = factoryFn(name);
                    } finally {
                        path.shift();
                        if (cache[name] === INSTANTIATING) {
                            delete cache[name];
                        }
                    }
                }
            }

            function invoke(fn, self, locals) {
                var args = _.map(annotate(fn), function (token) {
                    if (_.isString(token)) {
                        return locals && locals.hasOwnProperty(token) ? locals[token] : getService(token);
                    } else {
                        throw "Incorrect injection token! Expected a string,got " + token;
                    }
                });
                if (_.isArray(fn)) {
                    fn = _.last(fn);
                }
                return fn.apply(self, args);
            }

            function instantiate(Type, locals) {
                var UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
                var instance = Object.create(UnwrappedType.prototype);
                invoke(Type, instance, locals);
                return instance;
            }

            return {
                has: function (name) {
                    return cache.hasOwnProperty(name) || providerCache.hasOwnProperty(name + "Provider");
                },
                get: getService,
                annotate: annotate,
                invoke: invoke,
                instantiate: instantiate
            };
        }

        function runInvokeQueue(queue) {
            _.forEach(queue, function (invokeArgs) {
                var service = providerInjector.get(invokeArgs[0]);
                var method = invokeArgs[1];
                var args = invokeArgs[2];
                service[method].apply(service, args);
            });
        }

        var runBlocks = [];
        _.forEach(modulesToLoad, function loadModule(module) {
            if (!loadedModules.get(module)) {
                loadedModules.put(module, true);
                if (_.isString(module)) {
                    module = angular.module(module);
                    _.forEach(module.requires, loadModule);
                    runInvokeQueue(module._invokeQueue);
                    runInvokeQueue(module._configBlocks);
                    runBlocks = runBlocks.concat(module._runBlocks);
                } else if (_.isFunction(module) || _.isArray(module)) {
                    runBlocks.push(providerInjector.invoke(module));
                }
            }
        });
        _.forEach(_.compact(runBlocks), function (runBlock) {
            instanceInjector.invoke(runBlock);
        });

        return instanceInjector;
    }

    //HashKey
    function hashKey(value) {
        var type = typeof value;
        var uid;
        if (type === "function" || (type === "object" && value !== null)) {
            uid = value.$$hashKey;
            if (typeof uid === "function") {
                uid = value.$$hashKey();
            } else if (uid === undefined) {
                uid = value.$$hashKey = _.uniqueId();
            }
        } else {
            uid = value;
        }
        return type + ":" + uid;
    }
    function HashMap() { }
    HashMap.prototype = {
        put: function (key, value) {
            this[hashKey(key)] = value;
        },
        get: function (key) {
            return this[hashKey(key)];
        },
        remove: function (key) {
            key = hashKey(key);
            var value = this[key];
            delete this[key];
            return value;
        }
    };

    //$q
    function $QProvider() {
        this.$get = ["$rootScope", function ($rootScope) {
            return qFactory(function (callback) {
                $rootScope.$evalAsync(callback);
            });
        }];
    }
    function $$QProvider() {
        this.$get = function () {
            return qFactory(function (callback) {
                setTimeout(callback, 0);
            });
        };
    }
    function qFactory(callLater) {
        function Promise() {
            this.$$state = {};
        }
        Promise.prototype.then = function (onFulfilled, onRejected, onProgress) {
            var result = new Deferred();
            this.$$state.pending = this.$$state.pending || [];
            this.$$state.pending.push([result, onFulfilled, onRejected, onProgress]);
            if (this.$$state.status > 0) {
                scheduleProcessQueue(this.$$state);
            }
            return result.promise;
        };
        Promise.prototype.catch = function (onRejected) {
            return this.then(null, onRejected);
        };
        Promise.prototype.finally = function (callback, progressBack) {
            return this.then(function (value) {
                return handleFinallyCallback(callback, value, true);
            }, function (rejection) {
                return handleFinallyCallback(callback, rejection, false);
            }, progressBack);
        };

        function handleFinallyCallback(callback, value, resolved) {
            var callbackValue = callback();
            if (callbackValue && callbackValue.then) {
                return callbackValue.then(function () {
                    return makePromise(value, resolved);
                });
            } else {
                return makePromise(value, resolved);
            }
        }

        function makePromise(value, resolved) {
            var d = new Deferred();
            if (resolved) {
                d.resolve(value);
            } else {
                d.reject(value);
            }
            return d.promise;
        }

        function Deferred() {
            this.promise = new Promise();
        }
        Deferred.prototype.resolve = function (value) {
            if (this.promise.$$state.status) {
                return;
            }
            if (value && _.isFunction(value.then)) {
                value.then(
                        _.bind(this.resolve, this),
                        _.bind(this.reject, this),
                        _.bind(this.notify, this)
                    );
            } else {
                this.promise.$$state.value = value;
                this.promise.$$state.status = 1;
                scheduleProcessQueue(this.promise.$$state);
            }
        };
        Deferred.prototype.reject = function (reason) {
            if (this.promise.$$state.status) {
                return;
            }
            this.promise.$$state.value = reason;
            this.promise.$$state.status = 2;
            scheduleProcessQueue(this.promise.$$state);
        };
        Deferred.prototype.notify = function (progress) {
            var pending = this.promise.$$state.pending;
            if (pending && pending.length && !this.promise.$$state.status) {
                callLater(function () {
                    _.forEach(pending, function (handlers) {
                        var deferred = handlers[0];
                        var progressBack = handlers[3];
                        try {
                            deferred.notify(_.isFunction(progressBack) ? progressBack(progress) : progress);
                        } catch (e) {
                            console.log(e);
                        }
                    });
                });
            }
        };

        function defer() {
            return new Deferred();
        }

        function processQueue(state) {
            var pending = state.pending;
            delete state.pending;
            _.forEach(pending, function (handlers) {
                var deferred = handlers[0];
                var fn = handlers[state.status];
                try {
                    if (_.isFunction(fn)) {
                        deferred.resolve(fn(state.value));
                    } else if (state.status === 1) {
                        deferred.resolve(state.value);
                    } else {
                        deferred.reject(state.value);
                    }
                } catch (e) {
                    deferred.reject(e);
                }
            });
        }

        function scheduleProcessQueue(state) {
            callLater(function () {
                processQueue(state);
            });
        }
        function reject(rejection) {
            var d = defer();
            d.reject(rejection);
            return d.promise;
        }
        function when(value, callback, errback, progressback) {
            var d = defer();
            d.resolve(value);
            return d.promise.then(callback, errback, progressback);
        }
        function all(promises) {
            var results = _.isArray(promises) ? [] : {};
            var counter = 0;
            var d = defer();
            _.forEach(promises, function (promise, index) {
                counter++;
                when(promise).then(function (value) {
                    results[index] = value;
                    counter--;
                    if (!counter) {
                        d.resolve(results);
                    }
                }, function (rejection) {
                    d.reject(rejection);
                });
            });
            if (!counter) {
                d.resolve(results);
            }
            return d.promise;
        }

        var $Q = function Q(resolver) {
            if (!_.isFunction(resolver)) {
                throw "Expected function,got " + resolver;
            }
            var d = defer();
            resolver(_.bind(d.resolve, d), _.bind(d.reject, d));
            return d.promise;
        };

        return _.extend($Q, {
            defer: defer,
            reject: reject,
            when: when,
            resolve: when,
            all: all
        });
    }
    var PREFIX_REGEXP = /(x[\:\-\_]|data|[\:\-_])/i;
    function $HttpBackendProvider() {
        this.$get = function () {
            return function (method, url, post, callback, headers, timeout, withCredentials) {
                var xhr = new window.XMLHttpRequest();
                var timeoutId;
                xhr.open(method, url, true);
                _.forEach(headers, function (value, key) {
                    xhr.setRequestHeader(key, value);
                });
                if (withCredentials) {
                    xhr.withCredentials = true;
                }
                xhr.send(post || null);
                xhr.onload = function () {
                    if (!_.isUndefined(timeoutId)) {
                        clearTimeout(timeoutId);
                    }
                    var response = ("response" in xhr) ? xhr.response : xhr.responseText;
                    var statusText = xhr.statusText || "";
                    callback(
                        xhr.status,
                        response,
                        xhr.getAllResponseHeaders(),
                        statusText);
                };
                xhr.onerror = function () {
                    if (!_.isUndefined(timeoutId)) {
                        clearTimeout(timeoutId);
                    }
                    callback(-1, null, "");
                };
                if (timeout && timeout.then) {
                    timeout.then(function () {
                        xhr.abort();
                    });
                } else if (timeout > 0) {
                    timeoutId = setTimeout(function () {
                        xhr.abort();
                    }, timeout);
                }
            };
        };
    }

    function $HttpProvider() {
        var interceptorFactories = this.interceptors = [];
        var useApplyAsync = false;
        this.useApplyAsync = function (value) {
            if (_.isUndefined(value)) {
                return useApplyAsync;
            } else {
                useApplyAsync = !!value;
                return this;
            }
        };
        var defaults = this.defaults = {
            paramSerializer: "$httpParamSerializer",
            headers: {
                common: {
                    Accept: "application/json,text/plain,*/*"
                },
                post: {
                    "Content-Type": "application/json;charset=utf-8"
                },
                put: {
                    "Content-Type": "application/json;charset=utf-8"
                },
                patch: {
                    "Content-Type": "application/json;charset=utf-8"
                }
            },
            transformRequest: [function (data) {
                if (_.isObject(data) && !isBlob(data) && !isFile(data) && !isFormData(data)) {
                    return JSON.stringify(data);
                } else {
                    return data;
                }
            }],
            transformResponse: [defaultHttpResponseTransform]
        };
        this.$get = ["$httpBackend", "$q", "$rootScope", "$injector", function ($httpBackend, $q, $rootScope, $injector) {
            var interceptors = _.map(interceptorFactories, function (fn) {
                return _.isString(fn) ? $injector.get(fn) : $injector.invoke(fn);
            });
            function $http(requestConfig) {
                var config = _.extend({
                    method: "GET",
                    transformRequest: defaults.transformRequest,
                    transformResponse: defaults.transformResponse,
                    paramSerializer: defaults.paramSerializer
                }, requestConfig);
                if (_.isString(config.paramSerializer)) {
                    config.paramSerializer = $injector.get(config.paramSerializer);
                }
                config.headers = mergeHeaders(requestConfig);
                var promise = $q.when(config);
                _.forEach(interceptors, function (interceptor) {
                    promise = promise.then(interceptor.request, interceptor.requestError);
                });
                promise = promise.then(serverRequest);
                _.forEachRight(interceptors, function (interceptor) {
                    promise = promise.then(interceptor.response, interceptor.responseError);
                });
                promise.success = function (fn) {
                    promise.then(function (response) {
                        fn(response.data, response.status, response.headers, config);
                    });
                    return promise;
                };
                return promise;
            }
            function serverRequest(config) {
                if (_.isUndefined(config.withCredentials) && !_.isUndefined(defaults.withCredentials)) {
                    config.withCredentials = defaults.withCredentials;
                }

                var reqData = transformData(
                    config.data,
                    headersGetter(config.headers),
                    undefined,
                    config.transformRequest);

                if (_.isUndefined(reqData)) {
                    _.forEach(config.headers, function (v, k) {
                        if (k.toLowerCase() === "content-type") {
                            delete config.headers[k];
                        }
                    });
                }

                function transformResponse(response) {
                    if (response.data) {
                        response.data = transformData(
                            response.data,
                            response.headers,
                            response.status,
                            config.transformResponse);
                    }
                    if (isSuccess(response.status)) {
                        return response;
                    } else {
                        return $q.reject(response);
                    }
                }

                return sendReq(config, reqData).then(transformResponse, transformResponse);
            }
            function sendReq(config, reqData) {
                var deferred = $q.defer();
                $http.pendingRequests.push(config);
                deferred.promise.then(function () {
                    _.remove($http.pendingRequests, config);
                }, function () {
                    _.remove($http.pendingRequests, config);
                });
                function done(status, response, headersString, statusText) {
                    status = Math.max(status, 0);
                    function resolvePromise() {
                        deferred[isSuccess(status) ? "resolve" : "reject"]({
                            status: status,
                            data: response,
                            statusText: statusText,
                            headers: headersGetter(headersString),
                            config: config
                        });
                    }
                    if (useApplyAsync) {
                        $rootScope.$applyAsync(resolvePromise);
                    } else {
                        resolvePromise();
                        if (!$rootScope.$$phase) {
                            $rootScope.$apply();
                        }
                    }
                }

                var url = buildUrl(config.url, config.paramSerializer(config.params));

                function buildUrl(url, serializedParams) {
                    if (serializedParams.length) {
                        url += (url.indexOf("?") === -1) ? "?" : "&";
                        url += serializedParams;
                    }
                    return url;
                }
                $httpBackend(
                    config.method,
                    url,
                    config.data,
                    reqData,
                    done,
                    config.headers,
                    config.timeout,
                    config.withCredentials);

                return deferred.promise;
            }
            function transformData(data, headers, status, transform) {
                if (_.isFunction(transform)) {
                    return transform(data, headers, status);
                } else {
                    return _.reduce(transform, function (data, fn) {
                        return fn(data, headers, status);
                    }, data);
                }
            }
            function mergeHeaders(config) {
                var reqHeaders = _.extend(
                    {},
                    config.headers);
                var defHeaders = _.extend(
                    {},
                    defaults.headers.common,
                    defaults.headers[(config.method || "get").toLowerCase()]);
                _.forEach(defHeaders, function (value, key) {
                    var headerExists = _.any(reqHeaders, function (v, k) {
                        return k.toLowerCase() === key.toLowerCase();
                    });
                    if (!headerExists) {
                        reqHeaders[key] = value;
                    }
                });
                function executeHeaderFns(headers, config) {
                    return _.transform(headers, function (result, v, k) {
                        if (_.isFunction(v)) {
                            v = v(config);
                            if (_.isNull(v) || _.isUndefined(v)) {
                                delete result[k];
                            } else {
                                result[k] = v;
                            }
                        }
                    }, headers);
                }
                return executeHeaderFns(reqHeaders, config);
            }
            function headersGetter(headers) {
                var headerObj;
                return function (name) {
                    headerObj = headerObj || parseHeaders(headers);
                    if (name) {
                        return headerObj[name.toLowerCase()];
                    } else {
                        return headerObj;
                    }
                };
            }
            function parseHeaders(headers) {
                if (_.isObject(headers)) {
                    return _.transform(headers, function (result, v, k) {
                        result[_.trim(k.toLowerCase())] = _.trim(v);
                    }, {});
                } else {
                    var lines = headers.split("\n");
                    return _.transform(lines, function (result, line) {
                        var separatorAt = line.indexOf(':');
                        var name = _.trim(line.substr(0, separatorAt)).toLowerCase();
                        var value = _.trim(line.substr(separatorAt + 1));
                        if (name) {
                            result[name] = value;
                        }
                    }, {});
                }
            }
            function isSuccess(status) {
                return status >= 200 && status < 300;
            }
            $http.defaults = defaults;
            $http.pendingRequests = [];
            _.forEach(["get", "head", "delete"], function (method) {
                $http[method] = function (url, data, config) {
                    return $http(_.extend(config || {}, {
                        method: method.toUpperCase(),
                        url: url,
                        data: data
                    }));
                };
            });
            return $http;
        }];
        function defaultHttpResponseTransform(data, headers) {
            if (_.isString(data)) {
                var contentType = headers("Content-Type");
                if ((contentType && contentType.indexOf("application/json") === 0) || isJsonLike(data)) {
                    return JSON.parse(data);
                }
            }
        }
        function isBlob(object) {
            return object.toString() === "[object Blob]";
        }
        function isFile(object) {
            return object.toString() === "[object File]";
        }
        function isFormData(object) {
            return object.toString() === "[object FormData]";
        }
        function isJsonLike(data) {
            if (data.match(/^\{(?!\{)/)) {
                return data.match(/\}$/);
            } else if (data.match(/^\[/)) {
                return data.match(/\]$/);
            }
        }
    }

    function $HttpParamSerializerProvider() {
        this.$get = function () {
            return function serializeParams(params) {
                var parts = [];
                _.forEach(params, function (value, key) {
                    if (_.isNull(value) || _.isUndefined(value)) {
                        return;
                    }
                    if (!_.isArray(value)) {
                        value = [value];
                    }
                    _.forEach(value, function (v) {
                        if (_.isObject(v)) {
                            v = JSON.stringify(v);
                        }
                        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
                    });
                });
                return parts.join("&");
            };
        };
    }

    function $HttpParamSerializerJQLikeProvider() {
        this.$get = function () {
            return function (params) {
                var parts = [];
                function serialize(value, prefix, topLevel) {
                    if (_.isNull(value) || _.isUndefined(value)) {
                        return;
                    }
                    if (_.isArray(value)) {
                        _.forEach(value, function (v, i) {
                            serialize(v, prefix + "[" + (_.isObject(v) ? i : "") + "]");
                        });
                    } else if (_.isObject(value) && !_.isDate(value)) {
                        _.forEach(value, function (v, k) {
                            serialize(v, prefix + (topLevel ? "" : "[") + k + (topLevel ? "" : "]"));
                        });
                    } else {
                        parts.push(encodeURIComponent(prefix) + "=" + encodeURIComponent(value));
                    }
                }
                serialize(params, "", true);
                return parts.join("&");
            };
        };
    }

    function nodeName(element) {
        return element.nodeName ? element.nodeName : element[0].nodeName;
    }
    function $CompileProvider($provide) {
        var hasDirectives = {};
        var _this = this;
        this.directive = function (name, directiveFactory) {
            if (_.isString(name)) {
                if (name === "hasOwnProperty") {
                    throw "hasOwnProperty is not a valid directive name";
                }
                if (!hasDirectives.hasOwnProperty(name)) {
                    hasDirectives[name] = [];
                    $provide.factory(name + "Directive", ["$injector", function ($injector) {
                        var factories = hasDirectives[name];
                        return _.map(factories, function (factory, i) {
                            var directive = $injector.invoke(factory);
                            directive.restrict = directive.restrict || "EA";
                            directive.priority = directive.priority || 0;
                            directive.name = directive.name || name;
                            directive.index = i;
                            return directive;
                        });
                    }]);
                }
                hasDirectives[name].push(directiveFactory);
            } else {
                _.forEach(name, function (directiveFactory, name) {
                    _this.directive(name, directiveFactory);
                });
            }
        };
        this.$get = ["$injector", function ($injector) {
            function compile($compileNodes) {
                return compileNodes($compileNodes);
            }
            function compileNodes($compileNodes) {
                _.forEach($compileNodes, function (node) {
                    var attrs = {};
                    var directives = collectDirectives(node, attrs);
                    var terminal = applyDirectivesToNode(directives, node, attrs);
                    if (!terminal && node.childNodes && node.childNodes.length) {
                        compileNodes(node.childNodes);
                    }
                });
            }
            function applyDirectivesToNode(directives, compileNode, attrs) {
                var $compileNode = $(compileNode);
                var terminalPriority = -Number.MAX_VALUE;
                var terminal = false;
                _.forEach(directives, function (directive) {
                    if (directive.$$start) {
                        $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                    }
                    if (directive.priority < terminalPriority) {
                        return false;
                    }
                    if (directive.compile) {
                        directive.compile($compileNode, attrs);
                    }
                    if (directive.terminal) {
                        terminal = true;
                        terminalPriority = directive.priority;
                    }
                });
                return terminal;
            }
            function groupScan(node, startAttr, endAttr) {
                var nodes = [];
                if (startAttr && node && node.hasAttribute(startAttr)) {
                    var depth = 0;
                    do {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.hasAttribute(startAttr)) {
                                depth++;
                            } else if (node.hasAttribute(endAttr)) {
                                depth--;
                            }
                        }
                        node.push(node);
                        node = node.nextSibling;
                    } while (depth > 0)
                } else {
                    nodes.push(node);
                }
                return $(nodes);
            }
            function collectDirectives(node, attrs) {
                var directives = [];
                if (node.nodeType === Node.ELEMENT_NODE) {
                    var normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase());
                    addDirective(directives, normalizedNodeName, "E");
                    _.forEach(node.attributes, function (attr) {
                        var attrStartName, attrEndName;
                        var name = attr.name;
                        var normalizedAttrName = directiveNormalize(name.toLowerCase());
                        if (/^ngAttr[A-Z]/.test(normalizedAttrName)) {
                            name = _.kebabCase(normalizedAttrName[6].toLowerCase() + normalizedAttrName.substring(7));
                        }
                        var directiveNName = normalizedAttrName.replace(/(Start|End)$/, "");
                        if (directiveIsMultiElement(directiveNName)) {
                            if (/Start$/.test(normalizedAttrName)) {
                                attrStartName = name;
                                attrEndName = name.substring(0, name.length - 5) + "end";
                                name = name.substring(0, name.length - 6);
                            }
                        }
                        normalizedAttrName = directiveNormalize(name.toLowerCase());
                        addDirective(directives, normalizedAttrName, "A", attrStartName, attrEndName);
                        attrs[normalizedAttrName] = attr.value.trim();
                    });
                    _.forEach(node.classList, function (cls) {
                        var normalizedClassName = directiveNormalize(cls);
                        addDirective(directives, normalizedClassName, "C");
                    });
                } else if (node.nodeType === Node.COMMENT_NODE) {
                    var match = /^\s*directive\:\s*([\d\w\-_]+)/.exec(node.nodeValue);
                    if (match) {
                        addDirective(directives, directiveNormalize(match[1]), "M");
                    }
                }
                function directiveIsMultiElement(name) {
                    if (hasDirectives.hasOwnProperty(name)) {
                        var directives = $injector.get(name + "Directive");
                        return _.any(directives, { multiElement: true });
                    }
                    return false;
                }
                function byPriority(a, b) {
                    var diff = b.priority - a.priority;
                    if (diff == 0) {
                        return diff;
                    } else {
                        if (a.name !== b.name) {
                            return (a.name < b.name ? -1 : 1);
                        } else {
                            return a.index - b.index;
                        }
                    }
                }
                directives.sort(byPriority);
                return directives;
            }
            function addDirective(directives, name, mode, attrStartName, attrEndName) {
                if (hasDirectives.hasOwnProperty(name)) {
                    var foundDirectives = $injector.get(name + "Directive");
                    var applicableDirectives = _.filter(foundDirectives, function (dir) {
                        return dir.restrict.indexOf(mode) !== -1;
                    });
                    _.forEach(applicableDirectives, function (directive) {
                        if (attrStartName) {
                            directive = _.create(directive, {
                                $$start: attrStartName,
                                $$end: attrEndName
                            });
                        }
                        directives.push(directive);
                    });
                    directives.push.apply(directives, applicableDirectives);
                }
            }
            function directiveNormalize(name) {
                return _.camelCase(name.replace(PREFIX_REGEXP, ""));
            }
            return compile;
        }];
    }
    $CompileProvider.$inject = ["$provide"];

    function publishExternalAPI() {
        setupModuleLoader(window);

        var ngModule = angular.module("ng", []);
        ngModule.provider("$filter", $FilterProvider);
        ngModule.provider("$parse", $ParseProvider);
        ngModule.provider("$rootScope", $RootScopeProvider);
        ngModule.provider("$q", $QProvider);
        ngModule.provider("$$q", $$QProvider);
        ngModule.provider("$httpBackend", $HttpBackendProvider);
        ngModule.provider("$http", $HttpProvider);
        ngModule.provider("$httpParamSerializer", $HttpBackendProvider);
        ngModule.provider("$httpParamSerializerJQLike", $HttpParamSerializerJQLikeProvider);
        ngModule.provider("$compile", $CompileProvider);

        return ngModule;
    }

    window.publishExternalAPI = publishExternalAPI;
    window.createInjector = createInjector;

    var ngModule = publishExternalAPI();
    ngModule.directive("testing", function(){});
    createInjector(["ng"]);
})();
