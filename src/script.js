fetch("/mws", {
	method: "POST",
	headers: {
		"Content-Type": "application/json"
	}
})
	.then(response => response.json())
	.then(function ({ mWsSavings }) {
		console.log(mWsSavings);
	});
