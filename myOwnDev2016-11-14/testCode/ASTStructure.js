/**
 * Created by yj on 2016/12/30.
 */

//常量
var constantNode = {
    type: AST.Literal,
    value: "aaa" //value可以是字符串 数字 null true false
};

//数组
var arrayNode = {
    type: AST.ArrayExpression,
    elements: [
        //节点列表
        constantNode
    ]
};
var arrayNodeSpec = {
    type: AST.ArrayExpression,
    elements: [
        {
            type: AST.Literal,
            value: "aaa"
        }
    ]
};

//对象
var objectNode = {
    type: AST.ObjectExpression,
    properties: [
        {
            key: constantNode,
            value: constantNode
        },
        {
            key: constantNode,
            value: arrayNode
        }
    ]
};
var objectNodeSpec = {
    type: AST.ObjectExpression,
    properties: [
        {
            key: {
                type: AST.Literal,
                value: "aaa"
            },
            value: {
                type: AST.Literal,
                value: "aaa"
            }
        },
        {
            key: {
                type: AST.Identifier,
                value: "aaa"
            },
            value: {
                type: AST.Literal,
                value: "aaa"
            }
        },
        {
            key: {
                type: AST.Literal,
                value: "bbb"
            },
            value: {
                type: AST.ArrayExpression,
                elements: [
                    {
                        type: AST.Literal,
                        value: "aaa"
                    }
                ]
            }
        }
    ]
};
//赋值表达式
var assingmentNodeSpec = {
    type: AST.AssignmentExpression,
    left: {
        type: AST.Literal,
        value: "aaa"
    },
    right: {
        type: AST.Literal,
        value: "bbb"
    }
};
//一元运算符
var unaryNodeSpec = {
    type: AST.UnaryExpression,
    operator: '+',
    argument: 42
};