const apiKey = process.argv[2];
fetch("https://api.moonshot.cn/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
