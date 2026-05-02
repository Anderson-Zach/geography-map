var dateSlider = document.getElementById('slider-date');

function timestamp(str) {
    return new Date(str).getTime() / 1000;
}

noUiSlider.create(dateSlider, {
    // Create two timestamps to define a range.
    range: {
        min: timestamp('1939-08'),
        max: timestamp('1945-05')
    },

    // Steps of one week
    step: 24 * 60 * 60,

    // Two more timestamps indicate the handle starting positions.
    start: [timestamp('1939-08'), timestamp('1945-05')],

    // No decimals
    format: wNumb({
        decimals: 0
    })
});

var dateRanges = [timestamp('1939-08'), timestamp('1945-05')]
console.log(dateRanges)
var dateValues = [
    document.getElementById('event-start'),
    document.getElementById('event-end')
];

var formatter = new Intl.DateTimeFormat('en-US');

dateSlider.noUiSlider.on('update', function (values, handle) {
    dateValues[handle].value = formatter.format(new Date(+values[handle] * 1000));
});

dateSlider.noUiSlider.on('change', function (values, handle) {
    dateRanges[0] = +values[0];
    dateRanges[1] = +values[1];

    updateData();
});

dateSlider.noUiSlider.on('set', function (values, handle) {
    dateRanges[0] = +values[0];
    dateRanges[1] = +values[1];
    console.log("updateing")
    updateData();
});

// Define this at the top level of your file so it can be accessed globally
let timeInt;
let timelapseActive = false;

function playInterval() {
    timelapseActive = !timelapseActive;

    if (timelapseActive) {
        let i = 0;

        // Calculate these once before the loop starts to save CPU
        const startTimestamp = timestamp('1941');
        const endTimestamp = timestamp('1945');

        // 2 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
        const stepAmountMs = 2 * 24 * 60 * 60;

        timeInt = setInterval(function () {
            i += 1;
            const newEnd = startTimestamp + (i * stepAmountMs);

            // 1. Push new dates to the slider 
            // (This automatically triggers your text update and map draw)
            dateSlider.noUiSlider.set([startTimestamp, newEnd]);

            // 2. Check if we've reached 1945
            if (newEnd > endTimestamp) {
                console.log("Timelapse finished");
                clearInterval(timeInt);
                timelapseActive = false;
            }

            // REMOVE updateData() from here. 
            // The dateSlider.noUiSlider.set() function will trigger the 'set' event we made earlier.

        }, 100); // 100 milliseconds is a smooth, readable speed

    } else {
        // PAUSE: If they click the button while it's playing, stop the interval
        clearInterval(timeInt);
        console.log("Timelapse paused");
    }
}
