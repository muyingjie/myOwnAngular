/**
 * Created by yj on 2017/1/8.
 */
var OPERATORS = {
    '+': true,
    '!': true,
    '-': true
};
var ESCAPES = {
    'n':'\n',
    'f':'\f',
    'r':'\r',
    't':'\t',
    'v':'\v',
    '\'':'\'',
    '"':'"'
};
function Lexer(){

}
Lexer.prototype.lex = function (text) {
    this.text = text;
    this.index = 0;
    this.ch = undefined;
    this.tokens = [];
    while (this.index < this.text.length) {
        this.ch = this.text.charAt(this.index);
        //当前字符为'.'而且下一个字符是数字类型时，按照处理数字的算法处理
        if (this.isNumber(this.ch) || (this.is(".") && this.isNumber(this.peek()))) {
            this.readNumber();
        } else if(this.is("\'\"")) {
            this.readString(this.ch);
        } else if(this.ch.is("[],{}:.()=")) {
            //此处并没有解析数组内部的具体内容，具体内容的解析在arrayDeclaration成员方法中
            this.tokens.push({
                text: this.ch
            });
            this.index++;
        } else if(this.isIdent(this.ch)) {
            this.readIdent();
        } else if(this.isWhitespace(this.ch)) {
            this.index++;
        } else {
            var op = OPERATORS[this.ch];
            if (op) {
                this.tokens.push({text: this.ch});
                this.index++;
            } else {
                throw 'Unexpected next character: '+this.ch;
            }
        }
    }
    return this.tokens;
};
Lexer.prototype.is = function(chs) {
    return chs.indexOf(this.ch) >= 0;
};
Lexer.prototype.isNumber = function(ch) {
    return '0' <= ch && ch <= '9';
};
Lexer.prototype.readNumber = function() {
    var number = '';
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index).toLowerCase();
        if (ch === '.' || this.isNumber(ch)) {
            number += ch;
        } else {
            var nextCh = this.peek();
            var prevCh = number.charAt(number.length - 1);
            if (ch === 'e' && this.isExpOperator(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                nextCh && this.isNumber(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                (!nextCh || !this.isNumber(nextCh))) {
                throw "Invalid exponent";
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
//传进来的参数quote代表字符串的开始符号是什么（单引号或双引号）
Lexer.prototype.readString = function(quote) {
    this.index++;
    var string = '';
    //rawString将用于字符串节点的text属性，防止类似'"!"'的token串和单目运算————非运算相混淆
    var rawString = quote;
    var escape = false;
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index);
        rawString += ch;
        if(escape){
            if (ch === 'u') {
                //处理以\u开头（如\u4e00）类型的转义字符
                var hex = this.text.substring(this.index + 1, this.index + 5);
                if (!hex.match(/[\da-f]{4}/i)) {
                    throw 'Invalid unicode escape';
                }
                this.index += 4;
                string += String.fromCharCode(parseInt(hex, 16));
            } else {
                //处理普通转义字符
                var replacement = ESCAPES[ch];
                if (replacement) {
                    string += replacement;
                } else {
                    string += ch;
                }
            }
            escape = false;
        } else if (ch === quote) {
            this.index++;
            this.tokens.push({
                // text: string,
                text: rawString,
                value: string
            });
            return;
        } else if(ch === '\\') {
            escape = true;
        } else {
            string += ch;
        }
        this.index++;
    }
    throw 'Unmatched quote';
};
//识别标识符 token
Lexer.prototype.isIdent = function(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
        ch === '_' || ch === '$';
};
//读取标识符
Lexer.prototype.readIdent = function() {
    var text = '';
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
//获取当前位置后面的字符，如果到达了表达式末尾，则返回false
Lexer.prototype.peek = function() {
    return this.index < this.text.length - 1 ?
        this.text.charAt(this.index + 1) :
        false;
};
//紧跟在指数标识e后面的字符
Lexer.prototype.isExpOperator = function(ch) {
    return ch === '-' || ch === '+' || this.isNumber(ch);
};
//判断空白符
Lexer.prototype.isWhitespace = function(ch) {
    return ch === ' ' || ch === '\r' || ch === '\t' ||
        ch === '\n' || ch === '\v' || ch === '\u00A0';
};
//第二步
function AST(lexer) {
    this.lexer = lexer;
}
//这些常量将用于抽象结构树中每个节点的type属性，该属性描述了这个节点的语法特征
//每棵抽象结构树的顶级都是AST.Program类型的
AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';
AST.ThisExpression = 'ThisExpression';
AST.MemberExpression = 'MemberExpression';
AST.CallExpression = 'CallExpression';
AST.AssignmentExpression = 'AssignmentExpression';
AST.UnaryExpression = 'UnaryExpression';
AST.prototype.constants = {
    'null': {type: AST.Literal, value: null},
    'true': {type: AST.Literal, value: true},
    'false': {type: AST.Literal, value: false},
    'this': {type: AST.ThisExpression}
};
AST.prototype.ast = function(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
};
AST.prototype.program = function() {
    return {
        type: AST.Program,
        // body: this.constant()
        // body: this.primary()
        body: this.assignment() //assignment这个方法在实现时做了充分的考虑，如果有"="就按照赋值处理，没有等于号就按照取值处理
    };
};
//primary主要针对获取值
AST.prototype.primary = function() {
    var primary;
    //================================数组也是常量，因此需要放在primary函数中去==================================
    if (this.expect('[')){
        primary = this.arrayDeclaration();
    }
    //================================对象也是常量，因此需要放在primary函数中去==================================
    else if(this.expect('{')){
        primary = this.object();
    }
    //=====================================以下为对一个token的常量的处理=======================================
    else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
        //先看是否为true false null
        // return this.constants[this.tokens[0].text]; 不能确保每个tokens的长度一定大于1
        primary = this.constants[this.consume().text];
    }
    //================================对标识符的处理==========================================================
    else if (this.peek().identifier) {
        primary = this.identifier();
    }
    else {
        primary = this.constant();
    }
    //在解析完一个token之后如果又遇到了点"." 则代表对象引用
    // 刚刚解析完的token就变成了对象，接下来解析的是跟在该对象后的属性
    // 因为对象可以访问任意级，因此需要循环每个属性
    var next;
    // while (this.expect('.')) {
    while(next = this.expect('.', '[', '(')){
        if (next.text === '[') {
            // 处理通过[]访问对象属性的方式
            primary = {
                type: AST.MemberExpression,
                property: this.primary(),
                object: primary,
                computed: true //代表通过[来访问属性 ASTCompile recurse时会用
            };
            this.consume(']');
        } else if (next.text === '.') {
            // 处理通过.访问对象属性的方式
            primary = {
                type: AST.MemberExpression,
                property: this.identifier(),
                object: primary,
                computed: false //代表通过.来访问属性 ASTCompile recurse时会用
            };
        } else if (next.text === '(') {
            // 处理函数调用
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
AST.prototype.unary = function() {
    var token;
    if ((token = this.expect('+', '!', '-'))) {
        return {
            type: AST.UnaryExpression,
            operator: token.text,
            // argument: this.primary()
            argument: this.unary() //用于解决取反运算符多次调用 例如!!!a
        };
    } else {
        return this.primary();
    }
};
//assignment主要针对设置值，即赋值表达式
AST.prototype.assignment = function () {
    // var left = this.primary(); primary只是unary的一个分支
    var left = this.unary();
    if (this.expect('=')) {
        // var right = this.primary();
        var right = this.unary();
        return {type: AST.AssignmentExpression, left: left, right: right};
    }
    return left;
};
AST.prototype.constant = function() {
    return {
        type: AST.Literal,
        // value: this.tokens[0].value
        value: this.consume().value
    };
};
AST.prototype.identifier = function() {
    return {
        type: AST.Identifier,
        name: this.consume().text
    };
};
//该函数具体解析数组里面的每一项
AST.prototype.arrayDeclaration = function() {
    var elements = [];
    if (!this.peek(']')) {
        do {
            //遇到数组最后多了一个逗号的情况，直接结束循环
            if(this.peek(']')){
                break;
            }
            //会一直递归调用，直到找到基础类型的token（常量或变量）
            // elements.push(this.primary());
            //数组当中会存在赋值表达式的情况，因此这里也需要走assignment
            elements.push(this.assignment());
        } while (this.expect(','));
    }
    this.consume(']');
    //将elements整合到AST树节点的elements属性中，elements是数组类型节点才有的属性
    return {type: AST.ArrayExpression, elements: elements};
};
//对象在AST节点中的结构和数组类似
AST.prototype.object = function() {
    //收集所有属性节点的容器
    var properties = [];
    if(!this.peek('}')){
        do {
            //对象中的每个属性都是一个节点
            var property = {
                type: AST.Property
            };
            //属性的key又可以看成一个节点
            if(this.peek().identifier){
                //兼容key没有带引号的情况，即{aaa: 1}
                property.key = this.identifier();
            }else{
                //兼容key带引号的情况，即{"aaa": 1}这里的constant实际上用于处理字符串的情况
                property.key = this.constant();
            }
            //key所处token被编译完后，接下来的token应该是':'
            this.consume(':');
            // 对象的值也有可能是赋值表达式
            // property.value = this.primary();
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
//下一个token是否为参数e
//如果token是参数e或者不传参时，将该token从tokens栈中弹出
// AST.prototype.expect = function(e) {
// 为了解析obj[attr]这种类型的表达式，需要把expect和peek变成四个参数
AST.prototype.expect = function(e1, e2, e3, e4) {
    var token = this.peek(e1, e2, e3, e4);
    if(token){
        return this.tokens.shift();
    }
};
//看一下下一个token是否为参数e，内部调用expect成员方法，因此如果token和参数e相等的话，将tokens栈弹出一个token
AST.prototype.consume = function(e) {
    var token = this.expect(e);
    //当数组结束时如果没有结束符，token将返回false，直接抛出异常
    if (!token) {
        throw 'Unexpected. Expecting: ' + e;
    }
    return token;
};
//从栈顶取出一个token，并和参数e（即期望值）比较，如果二者相等，则返回token栈顶项
//不传参时也返回栈顶项
// AST.prototype.peek = function(e) {
AST.prototype.peek = function(e1, e2, e3, e4) {
    if (this.tokens.length > 0) {
        var text = this.tokens[0].text;
        // if (text === e || !e) {
        if (text === e1 || text === e2 || text === e3 || text === e4 || (!e1 && !e2 && !e3 && !e4)) {
            return this.tokens[0];
        }
    }
};
//和解析数组里面各项的算法一样，这里是解析函数参数
AST.prototype.parseArguments = function() {
    var args = [];
    if (!this.peek(')')) {
        do {
            // 函数调用时的参数也有可能是赋值表达式
            // args.push(this.primary());
            args.push(this.assignment());
        } while (this.expect(','));
    }
    return args;
};
//第三步
function ASTCompiler(astBuilder) {
    this.astBuilder = astBuilder;
}
//compile方法最终需要返回一个函数
ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
    //在编译生成函数时，函数里面需要定义很多变量，这些变量名以v开头，后面依次跟上递增的数字，nextId代表该递增的数字
    //Js中变量名会提升，因此我们把定义变量的工作放在最顶层，vars存储所有定义过的变量
    this.state = {body: [], nextId: 0, vars: []};
    //recurse方法会给body数组push一段一段的字符串，这些字符串最终会拼接成一个函数体
    this.recurse(ast);
    //返回最终的函数
    //参数s即为scope对象
    // return new Function("s", this.state.body.join(""));
    //改为将所有的变量提升到函数最上方定义
    // return new Function('s', 'l',
    //     (this.state.vars.length ?
    //         'var ' + this.state.vars.join(',') + ';' :
    //             ''
    //     ) + this.state.body.join(''));

    // 对于通过"."来访问属性的途径我们可以通过给ensureSafeMemberName传入要检测的值来判断其是否安全
    // 但是对于通过[]来访问属性的途径，由于我们无法在编译的时候知道该属性所代表的具体的值
    // 因此我们需要在运行的时候去做校验，即表达式被执行的时候被校验，因此需要把校验函数作为参数传进$watch的函数
    // 最后通过闭包的形式返回函数，并将校验函数ensureSafeMemberName传入
    var fnString = 'var fn=function(s,l){' +
        (this.state.vars.length ?
            'var ' + this.state.vars.join(',') + ';' :
                ''
        ) +
        this.state.body.join('') +
        '}; return fn;';

    return new Function(
        'ensureSafeMemberName',
        'ensureSafeObject',
        'ensureSafeFunction',
        'ifDefined',
        fnString)(
        ensureSafeMemberName,
        ensureSafeObject,
        ensureSafeFunction,
        ifDefined);
};
// context表示函数调用时的上下文环境，context对象参数有下面三个属性
// context - The owning object of the method. Will eventually become this.
// name - The method’s property name in the owning object.
// computed - Whether the method was accessed as a computed property or not.

// aaa.bbb.ccc如果bbb是undefined，在js中会报错，但是在这里不会报错，需要在recurse中传入第三个参数控制
ASTCompiler.prototype.recurse = function(ast, context, create) {
    var intoId;
    switch (ast.type){
        //Program需要生成return表达式
        case AST.Program:
            this.state.body.push("return ", this.recurse(ast.body), ";");
            break;
        //Literal是叶子节点，仅仅是一个值，因此我们直接返回它即可
        case AST.Literal:
            return this.escape(ast.value);
        case AST.ArrayExpression:
            //将抽象树中的各项转为常量字符串
            var elements = _.map(ast.elements, function (element) {
                return this.recurse(ast.elements);
            }, this);
            return "[" + elements.join(",") + "]";
        case AST.ObjectExpression:
            var properties = _.map(ast.properties, function (property) {
                var key = property.key.type === AST.Identifier ? property.key.name :
                    this.escape(property.key.value);
                var value = this.recurse(property.value);
                return key + ":" + value;
            }, this);
            return "{" + properties.join(',') + "}";
        case AST.Identifier:
            //遇到constructor __proto__ __defineGetter__等等的token时，直接抛出错误
            ensureSafeMemberName(ast.name);
            // var intoId = this.nextId();
            // intoId变量需要在多个case下共用
            intoId = this.nextId();
            // 在new Function的函数体里面已经var定义过所有的变量了，因此在此无需再重复定义
            // this.state.body.push("var ", intoId, ";");
            // 函数中如果传入第二个参数l，就用对象l
            // this.if_('l', this.assign(intoId, this.nonComputedMember('l', ast.name)));
            // 对象l中存在ast.name属性时才用l对象的属性，否则用s对象的
            this.if_(this.getHasOwnProperty('l', ast.name),
                this.assign(intoId, this.nonComputedMember('l', ast.name)));
            // this.if_(this.not("l") + " && s", this.assign(intoId , this.nonComputedMember("s", ast.name) + ";"));
            //如果s也没有ast.name属性，就给该属性赋空对象
            if (create) {
                this.if_(this.not(this.getHasOwnProperty('l', ast.name)) +
                    ' && s && ' +
                    this.not(this.getHasOwnProperty('s', ast.name)),
                    this.assign(this.nonComputedMember('s', ast.name), '{}'));
            }
            this.if_(this.not(this.getHasOwnProperty('l', ast.name)) + ' && s',
                this.assign(intoId, this.nonComputedMember('s', ast.name)));
            if (context) {
                context.context = this.getHasOwnProperty('l', ast.name) + '?l:s';
                context.name = ast.name;
                context.computed = false;
            }
            //不可以将window用来赋值
            this.addEnsureSafeObject(intoId);
            return intoId;
        case AST.ThisExpression:
            return "s";
        case AST.MemberExpression:
            intoId = this.nextId();
            var left = this.recurse(ast.object, undefined, create);
            if (context) {
                context.context = left;
            }
            if(ast.computed){
                var right = this.recurse(ast.property);
                //遇到constructor __proto__ __defineGetter__等等的token时，直接抛出错误
                this.addEnsureSafeMemberName(right);
                //aaa.bbb.ccc如果bbb是undefined，在js中会报错，但是在这里不会报错，在此处理create
                if (create) {
                    this.if_(this.not(this.computedMember(left, right)),
                        this.assign(this.computedMember(left, right), '{}'));
                }
                this.if_(left,
                    this.assign(intoId,
                        'ensureSafeObject(' + this.computedMember(left, right) + ')'));
                if (context) {
                    context.name = right;
                    context.computed = true;
                }
            } else {
                //遇到constructor __proto__ __defineGetter__等等的token时，直接抛出错误
                ensureSafeMemberName(ast.property.name);
                //aaa.bbb.ccc如果bbb是undefined，在js中会报错，但是在这里不会报错，在此处理create
                if (create) {
                    this.if_(this.not(this.nonComputedMember(left, ast.property.name)),
                        this.assign(this.nonComputedMember(left, ast.property.name), '{}'));
                }
                this.if_(left,
                    this.assign(intoId,
                        'ensureSafeObject(' +
                        this.nonComputedMember(left, ast.property.name) + ')'));
                if (context) {
                    context.name = ast.property.name;
                    context.computed = false;
                }
            }
            return intoId;
        case AST.CallExpression:
            var callContext = {};
            //callContext代表函数调用的上下文环境，在下面这个recurse的时候会给callContext赋name computed context等属性
            var callee = this.recurse(ast.callee, callContext);
            var args = _.map(ast.arguments, function (arg) {
                return 'ensureSafeObject(' + this.recurse(arg) + ')';
            }, this);
            if (callContext.name) {
                this.addEnsureSafeObject(callContext.context);
                if (callContext.computed) {
                    callee = this.computedMember(callContext.context, callContext.name);
                } else {
                    callee = this.nonComputedMember(callContext.context, callContext.name);
                }
            }
            //callee不能篡改this指向，addEnsureSafeFunction排除了call apply等调用形式
            this.addEnsureSafeFunction(callee);
            // return callee + "&&" + callee + "(" + args.join(",") + ")";
            // 函数返回值不能是window
            return callee + '&&ensureSafeObject(' + callee + '(' + args.join(',') + '))';
        case AST.AssignmentExpression:
            var leftContext = {};
            //aaa.bbb.ccc如果bbb是undefined，在js中会报错，但是在这里不会报错，需要在recurse中传入第三个参数控制
            this.recurse(ast.left, leftContext, true);
            var leftExpr;
            if (leftContext.computed) {
                leftExpr = this.computedMember(leftContext.context, leftContext.name);
            } else {
                leftExpr = this.nonComputedMember(leftContext.context, leftContext.name);
            }
            return this.assign(leftExpr, 'ensureSafeObject(' + this.recurse(ast.right) + ')');
        case AST.UnaryExpression:
            //如果ast.argument是undefined，默认设置为0
            return ast.operator + '(' + this.ifDefined(this.recurse(ast.argument), 0) + ')';
    }
};
ASTCompiler.prototype.escape = function(value) {
    if (_.isString(value)) {
        return '\'' + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';
    } else if(_.isNull(value)){
        return "null";
    } else {
        return value;
    }
};
ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;
ASTCompiler.prototype.stringEscapeFn = function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
};
ASTCompiler.prototype.nonComputedMember = function(left, right) {
    return '(' + left + ').' + right;
};
ASTCompiler.prototype.computedMember = function(left, right) {
    return '(' + left + ')[' + right + ']';
};
ASTCompiler.prototype.if_ = function(test, consequent) {
    this.state.body.push('if(', test, '){', consequent, '}');
};
ASTCompiler.prototype.assign = function(id, value) {
    return id + '=' + value + ';';
};
ASTCompiler.prototype.nextId = function() {
    var id = 'v' + (this.state.nextId++);
    this.state.vars.push(id);
    return id;
};
ASTCompiler.prototype.not = function(e) {
    return '!(' + e + ')';
};
ASTCompiler.prototype.getHasOwnProperty = function(object, property) {
    return object + '&&(' + this.escape(property) + ' in ' + object + ')';
};
ASTCompiler.prototype.addEnsureSafeMemberName = function(expr) {
    this.state.body.push('ensureSafeMemberName(' + expr + ');');
};
ASTCompiler.prototype.addEnsureSafeObject = function(expr) {
    this.state.body.push('ensureSafeObject(' + expr + ');');
};
ASTCompiler.prototype.addEnsureSafeFunction = function(expr) {
    this.state.body.push('ensureSafeFunction(' + expr + ');');
};
ASTCompiler.prototype.ifDefined = function(value, defaultValue) {
    return 'ifDefined(' + value + ',' + this.escape(defaultValue) + ')';
};
function ifDefined(value, defaultValue) {
    return typeof value === 'undefined' ? defaultValue : value;
}
function ensureSafeMemberName(name) {
    if (name === 'constructor' || name === '__proto__' ||
        name === '__defineGetter__' || name === '__defineSetter__' ||
        name === '__lookupGetter__' || name === '__lookupSetter__') {
        throw 'Attempting to access a disallowed field in Angular expressions!';
    }
}
function ensureSafeObject(obj) {
    if (obj) {
        if (obj.document && obj.location && obj.alert && obj.setInterval) {
            throw 'Referencing window in Angular expressions is disallowed!';
        } else if (obj.children &&
            (obj.nodeName || (obj.prop && obj.attr && obj.find))) {
            throw 'Referencing DOM nodes in Angular expressions is disallowed!';
        } else if (obj.constructor === obj) {
            //排除obj是Function构造函数的情况
            throw 'Referencing Function in Angular expressions is disallowed!';
        } else if (obj.getOwnPropertyNames || obj.getOwnPropertyDescriptor) {
            //排除obj是Object对象的情况
            throw 'Referencing Object in Angular expressions is disallowed!';
        }
    }
    return obj;
}
var CALL = Function.prototype.call;
var APPLY = Function.prototype.apply;
var BIND = Function.prototype.bind;
function ensureSafeFunction(obj) {
    if (obj) {
        if (obj.constructor === obj) {
            throw 'Referencing Function in Angular expressions is disallowed!';
        } else if (obj === CALL || obj === APPLY || obj === BIND) {
            throw 'Referencing call, apply, or bind in Angular expressions '+
            'is disallowed!';
        }
    }
    return obj;
}
//第四步
function Parser(lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
}
//parse方法最后会返回一个函数
Parser.prototype.parse = function(text) {
    return this.astCompiler.compile(text);
};
//===================编译过程
//parse方法接收一个字符串类型的表达式，返回一个函数，这个函数的返回值将是该表达式在所处的scope环境中的值
function parse(expr) {
    var lexer = new Lexer();
    var parser = new Parser(lexer);
    return parser.parse(expr);
}