## koa2-ueditor

koa2 版的 UEditor 百度编辑器，支持修改 UEditor 的配置

### Installation

```
 npm install koa2-ueditor --save
```

### Usage


1. 使用简单，只需传一个静态目录参数。不传则默认是public
```javascript
// 直接写路由
// 然后修改 web 端的 ueditor.config.js 配置 serverUrl 为对应路由地址
// serverUrl: "/editor/controller"

const router = require('koa-router')()
const ueditor = require('koa2-ueditor')

router.all('/editor/controller', ueditor('public'))
```


2. 可以修改 UEditor 配置，具体的参数请参考 UEditor 官方的 [config.json](https://github.com/fex-team/ueditor/blob/dev-1.5.0/php/config.json)
```javascript
// 需要传一个数组：静态目录和 UEditor 配置对象
// 比如要修改上传图片的类型、保存路径
router.all('/editor/controller', ueditor(['public', {
	"imageAllowFiles": [".png", ".jpg", ".jpeg"]
	"imagePathFormat": "/upload/ueditor/image/{yyyy}{mm}{dd}/{filename}"  // 保存为原文件名
}]))
```
