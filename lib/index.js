const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const upload = require('./upload')
const config = require('./config')

// 同步遍历文件
function eachFileSync(dir, findOneFile){
    const stats = fs.statSync(dir)
    if(stats.isDirectory()){
        fs.readdirSync(dir).forEach(file => {
            eachFileSync(path.join(dir, file), findOneFile)
        })
    }else{
        findOneFile(dir, stats)
    }
}

// 处理Ueditor上传保存路径
function setFullPath(dest) {
    const date = new Date();
    const map = {
        t: date.getTime(), // 时间戳
        y: date.getFullYear(), // 年
        m: date.getMonth() + 1, // 月
        d: date.getDate(), // 日
        h: date.getHours(), // 时
        i: date.getMinutes(), // 分
        s: date.getSeconds(), // 秒
    };

    return dest.replace(/\{([ymdhis])\1*\}|\{time\}|\{rand:(\d+)\}/g, function(all, $1, $2) {
        if ($1 !== void 0) {
            const v = String(map[$1]);
            const l = all.length;
            if ($1 != 'y') {
                return l > 3 && v <= 9 ? '0' + v : v;
            }
            return v.substr(6 - l);
        }

        if (all === '{time}') return String(map.t);

        return String(Math.random()).substr(2, Number($2) || 6);
    });
}

// 抓取网络图片
const catchImage = function(url) {
    const request = /^https:\/\//.test(url) ? https.request : http.request
    let image = url.match(/^(:?https?\:)?\/\/[^#?]+/)[0]
    let originalname = image.substr(image.lastIndexOf('\/') + 1)
    let contentType = ''
    let base64Data = ''
    return new Promise((resolve, reject) => {
        const req = request(url, (res) => {
            contentType = res.headers['content-type']
            res.setEncoding('base64')
            res.on('data', (chunk) => {
                base64Data += chunk
            })
            res.on('end', () => resolve({contentType, base64Data, originalname}))
        })

        req.on('error', (err) => resolve({error: true}))
        req.end()
    })
}

/**
 * ueditor上传方法
 * @param  {string/array} dir    静态目录，若是数组[dir, UEconfig]第2个为Ueditor配置
 * @param  {object} options      upload方法参数
 * @return {function}            Ueditor Controller
 */
const ueditor = function(dir, options) {
    let ueOpts = []
    if(typeof dir === 'object'){
        if(Array.isArray(dir)){
            ueOpts = dir
        }else{
            options = dir
            ueOpts.push('public')
        }
    }else{
        ueOpts.push(dir || 'public')
    }

    const publicDir = path.resolve(ueOpts[0])
    const conf = Object.assign({}, config, ueOpts[1] || {})
    const uploadType = {
        [conf.imageActionName]: 'image',
        [conf.scrawlActionName]: 'scrawl',
        [conf.catcherActionName]: 'catcher',
        [conf.videoActionName]: 'video',
        [conf.fileActionName]: 'file',
    }
    const listType = {
        [conf.imageManagerActionName]: 'image',
        [conf.fileManagerActionName]: 'file',
    }

    // Ueditor Controller
    return async (ctx, next) => {
        let result = {}
        let {action, start = 0, callback} = ctx.query
        start = parseInt(start)

        // 上传文件
        if(Object.keys(uploadType).includes(action)){
            const actionName = uploadType[action]
            let pathFormat = setFullPath(conf[actionName + 'PathFormat']).split('/')
            let filename = pathFormat.pop()
            try {
                // 涂鸦类型图片
                if(action === conf.scrawlActionName){
                    let base64Data = ctx.request.body[conf[actionName + 'FieldName']]
                    let base64Length = base64Data.length
                    if(base64Length - (base64Length / 8) * 2 > conf[actionName + 'MaxSize']){
                        throw new Error('Picture too big')
                    }
                    ctx.req.file = upload.base64Image(base64Data, publicDir, {
                        destination: path.join(publicDir, ...pathFormat)
                    })

                    result = Object.assign({state: 'SUCCESS'}, upload.fileFormat(ctx.req.file))
                }
                // 抓取远程图片
                else if(action === conf.catcherActionName){
                    const sources = ctx.request.body[conf[actionName + 'FieldName']]
                    let list = []
                    let images = []
                    sources.forEach((url) => {
                        images.push(catchImage(url).then((image) => {
                            if(image.error){
                                list.push({state: 'ERROR', source: url})
                            }else{
                                let base64Data = image.base64Data
                                let base64Length = base64Data.length
                                if(base64Length - (base64Length / 8) * 2 > conf[actionName + 'MaxSize']){
                                    list.push({state: 'Picture too big', source: url})
                                }else{
                                    // 重新获取filename
                                    filename = setFullPath(conf[actionName + 'PathFormat']).split('/').pop()
                                    if(filename === '{filename}'){
                                        filename = image.originalname.replace(/\.\w+$/, '')
                                    }
                                    if(/^image\/(\w+)$/.test(image.contentType)){
                                        base64Data = 'data:'+ image.contentType +';base64,' + base64Data
                                    }
                                    list.push(Object.assign({state: 'SUCCESS', source: url}, upload.fileFormat(
                                        upload.base64Image(base64Data, publicDir, {
                                            destination: path.join(publicDir, ...pathFormat),
                                            filename
                                        })
                                    ), {original: image.originalname}))
                                }
                            }
                            return image
                        }))
                    })

                    await Promise.all(images)
                    result = {state: 'SUCCESS', list}
                }
                // 表单上传图片、文件
                else{
                    await upload(publicDir, {
                        storage: upload.diskStorage({
                            destination: path.join(publicDir, ...pathFormat),
                            filename (req, file, cb) {
                                if(filename === '{filename}'){
                                    filename = file.originalname
                                }else{
                                    filename += upload.getSuffix(file.originalname)
                                }
                                cb(null, filename)
                            }
                        }),
                        limits: {
                            fileSize: conf[actionName + 'MaxSize']
                        },
                        allowfiles: conf[actionName + 'AllowFiles']
                    }, options || {}).single(conf[actionName + 'FieldName'])(ctx, next)

                    result = Object.assign({state: 'SUCCESS'}, upload.fileFormat(ctx.req.file))
                }
            } catch (err) {
                result = {state: err.message}
            }
        }
        // 获取图片/文件列表
        else if(Object.keys(listType).includes(action)){
            const actionName = listType[action]
            let files = []
            eachFileSync(path.join(publicDir, conf[actionName + 'ManagerListPath']), (file, stat) => {
                if(conf[actionName + 'ManagerAllowFiles'].includes(upload.getSuffix(file))){
                    const url = file.replace(publicDir, '').replace(/\\/g, '\/')
                    const mtime = stat.mtimeMs
                    files.push({url, mtime})
                }
            })
            result = {
                list: files.slice(start, start + conf[actionName + 'ManagerListSize']),
                start: start,
                total: files.length,
                state: 'SUCCESS'
            }
        }
        // 返回Ueditor配置给前端
        else if(action === 'config'){
            result = conf
        }
        else{
            result = {state: 'FAIL'}
        }

        ctx.body = callback ? [callback] + '(' + JSON.stringify(result) + ')' : JSON.stringify(result)
    }
}

exports = module.exports = ueditor
exports.eachFileSync = eachFileSync
exports.setFullPath = setFullPath
