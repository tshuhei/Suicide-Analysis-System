curvechart = {};
/**
 * the margin of curvechart
 */
curvechart.margin = {
    top: 70,
    bottom: 70,
    left: 70,
    right: 70
};

/**
 * normalize the name (replace unsupported chars) so that it can be used as class name
 * @param {string} name
 */
curvechart.normalize = function(name){
    return name.replace(/ /g, '_').replace(/\//g, '_');
};

/**
 * change the format of main.wholeYearData to an object so that it could be used more conveniently later
 */
curvechart.setLocalData = function(){
    let data = main.wholeYearData;
    this.localData = {};
    // this.data is an object indexed by year
    // each value is also an object indexed by country
    let yearSet = new Set(data.map(d => d.year));
    let countrySet = new Set(data.map(d => d.country));
    yearSet.forEach(function(year){
        let yearString = year.toString();
        this.localData[yearString] = {};
        countrySet.forEach(function(country){
            let item = main.getItem(data, country, year);
            if(item !== null){
                // found it
                this.localData[yearString][country] = item;
            }
        }, this);
    }, this);
    // bind yearSet, countrySet to this
    this.yearSet = yearSet;
    this.countrySet = countrySet;
}


/**
 * initialize the chart using main.wholeYearData
 */
curvechart.init = function(){
    this.EPSILON = 1e-8;
    this.IN_DURATION = 990;
    this.EX_DURATION = 1000;
    this.type = 'suicide_ratio';
    this.parseTime = d3.timeParse('%Y');
    this.animating = false;
    this.currentStart = main.START_YEAR;
    this.currentEnd = main.END_YEAR;
    this.now = this.currentEnd;
    let wholeChart = d3.select('#curvechart');
    wholeChart.append('g')
        .attr('id', 'curve');
    wholeChart.append('g')
        .attr('id', 'control');
    this.setControlAxis();
    this.setLocalData();
    this.draw();    
}

curvechart.setControlAxis = function(){
    const bbox = document.getElementById('curvechart')
        .getBoundingClientRect();
    const svgWidth = bbox.width;
    const svgHeight = bbox.height;
    const RADIUS = 4;

    let controlSvg = d3.select('#curvechart')
        .select('#control')
        .attr('transform', 'translate(' + this.margin.left + "," + (svgHeight - this.margin.bottom* 1/3) + ")");
    
    let startDate =  this.parseTime(main.START_YEAR.toString());
    let endDate = this.parseTime(main.END_YEAR.toString());

    let tickValues = [];
    for(let year = main.START_YEAR; year <= main.END_YEAR; year++){
        tickValues.push(this.parseTime(year.toString()));
    }
    this.controlScale = d3.scaleTime()
        .domain([startDate, endDate])
        .range([0, svgWidth - this.margin.right - this.margin.left]);
    
    let interval = this.controlScale.range()[1] / (main.END_YEAR - main.START_YEAR);
    let xScaleByYear = (year)=>{
        return interval * (year - main.START_YEAR);
    }

    controlSvg.append('g')
        .attr('id', 'control-xAxis')
        .call(d3.axisBottom().scale(this.controlScale).tickValues(tickValues).tickFormat(d3.timeFormat('%Y')));
    
    let startTick = controlSvg.append('circle')
        .attr('id', 'start')
        .attr('cx', xScaleByYear(this.currentStart))
        .attr('cy', 0)
        .attr('r', RADIUS)
        .attr('fill', 'black');
    
    let endTick = controlSvg.append('circle')
        .attr('id', 'end')
        .attr('cx', xScaleByYear(this.currentEnd))
        .attr('cy', 0)
        .attr('r', RADIUS)
        .attr('fill', 'black');
    
    let nowTick = controlSvg.append('use')
        .attr('id', 'now')
        .attr('href', '#pointer')
        .attr('fill', 'blue')
        .attr('opacity', 0.5)
        .attr('x', xScaleByYear(this.now));
    
    let dragHandler = d3.drag()
        .on('start', function(){
            if(curvechart.animating) return;
            let current = d3.select(this);
            let xlabel = current.attr('id') === 'now' ? 'x' : 'cx';
            let delta = current.attr(xlabel) - d3.event.x;
            current.datum(delta);
        })
        .on('drag', function(){
            if(curvechart.animating) return;
            let current = d3.select(this);
            let xlabel = current.attr('id') === 'now' ? 'x' : 'cx';
            let xpos = bound(current.datum() + d3.event.x, current.attr('id'));
            current.attr(xlabel, xpos);
        })
        .on('end', function(){
            if(curvechart.animating) return;
            let current = d3.select(this);
            let id = current.attr('id');
            let xlabel = id === 'now' ? 'x' : 'cx';
            let xpos = Number(current.attr(xlabel));
            xpos = interval * Math.round(xpos / interval);
            current.transition()
                .attr(xlabel, xpos)
                .on('end', function(){
                    let year = Math.round(xpos / interval) + main.START_YEAR;
                    if(id === 'start'){
                        curvechart.currentStart = year;
                    }
                    else if(id === 'now'){
                        curvechart.now = year;
                        // change main.singleYearData
                        main.singleYearData = main.wholeYearData.filter(function(datum){
                            return datum.year === curvechart.now;
                        });

                        sunburst.update(0);
                        scatterplot.update(0);
                        histogram.update(0);
                    }
                    else if(id === 'end'){
                        curvechart.currentEnd = year;
                    }
                    curvechart.draw();
                });
        });
    dragHandler(startTick);
    dragHandler(endTick);
    dragHandler(nowTick);

    function bound(xpos, id){
        if(id === 'start'){
            xpos = Math.max(xpos, 0);
            xpos = Math.min(xpos, Number(nowTick.attr('x')));
            xpos = Math.min(xpos, Number(endTick.attr('cx')) - interval);
        }
        else if(id === 'now'){
            xpos = Math.max(xpos, Number(startTick.attr('cx')));
            xpos = Math.min(xpos, Number(endTick.attr('cx')));
        }
        else{
            xpos = Math.min(xpos, xScaleByYear(main.END_YEAR));
            xpos = Math.max(xpos, Number(nowTick.attr('x')));
            xpos = Math.max(xpos, Number(startTick.attr('cx')) + interval);
        }
        return xpos;
    }

    // add button
    const halfSideLen = 8;
    const padding = 2 * halfSideLen;
    let rect = controlSvg.append('rect')
        .attr('id', 'button')
        .attr('fill', 'lightgray')
        .attr('stroke', 'black')
        .attr('width', halfSideLen * 2)
        .attr('height', halfSideLen * 2)
        .attr('x', - halfSideLen * 2 - padding)
        .attr('y', - halfSideLen);

    const innerHalfSideLen = 5;
    let startcmd = 
        `M ${-padding - halfSideLen - innerHalfSideLen}, ${-innerHalfSideLen}` + 
        `l ${2 * innerHalfSideLen}, ${innerHalfSideLen}` +
        `l ${-2 * innerHalfSideLen}, ${innerHalfSideLen}` +
        `z`;
    
    let stopcmd =
        `M ${-padding - halfSideLen - innerHalfSideLen}, ${-innerHalfSideLen}` +
        `h ${innerHalfSideLen * 2/3}` +
        `v ${2 * innerHalfSideLen}` +
        `h ${-innerHalfSideLen * 2/3}` +
        `z` +
        `M ${-padding - halfSideLen + innerHalfSideLen}, ${-innerHalfSideLen}` +
        `v ${2 * innerHalfSideLen}` +
        `h ${-innerHalfSideLen * 2/3}` +
        `v ${- 2* innerHalfSideLen}` +
        'z';
    let mark = controlSvg.append('path')
        .attr('id', 'buttonMark')
        .datum([startcmd, stopcmd])
        .attr('d', startcmd)
        .attr('fill', 'black')
        .attr('pointer-events', 'none');
    
    rect.on('mouseover', function(){
            rect.attr('fill', 'black');
            mark.attr('fill', 'lightgray');
        })
        .on('mouseout', function(){
            rect.attr('fill', 'lightgray');
            mark.attr('fill', 'black');
        })
        .on('click', function(){
            if(curvechart.animating === true){
                curvechart.stopAnimation();
            }
            else{
                curvechart.animating = true;
                mark.attr('d', stopcmd);
                window.dataUpdatingInterval = window.setInterval(function(){
                    curvechart.animate();
                }, curvechart.EX_DURATION);
            }
        });
    this.xScaleByYear = xScaleByYear;
}

/**
 * animate from now to currentEnd
 */
curvechart.animate = function(){
    if(this.now < this.currentEnd){
        this.now++;
        // change main.singleYearData
        main.singleYearData = main.wholeYearData.filter(function(datum){
            return datum.year === curvechart.now;
        });
        sunburst.update(this.IN_DURATION);
        this.__update__(this.IN_DURATION);
        scatterplot.update(this.IN_DURATION);
        histogram.update(this.IN_DURATION);

        // move nowTick
        d3.select('use')
            .transition()
            .duration(this.IN_DURATION)
            .attr('x', this.xScaleByYear(this.now));
    }
    else{
        this.stopAnimation();
    }
}

/**
 * stop animation
 */
curvechart.stopAnimation = function(){
    this.animating = false;
        window.clearInterval(window.dataUpdatingInterval);
        d3.select('#buttonMark')
            .attr('d', function(d){
                return d[0];
            });
}
/**
 * set scale
 */
curvechart.setScale = function(){
    let curveSvg = d3.select('#curvechart')
        .select('#curve');
    const bbox = document.getElementById('curvechart')
        .getBoundingClientRect();
    const svgWidth = bbox.width;
    const svgHeight = bbox.height;
    let startDate =  this.parseTime(this.currentStart.toString());
    let endDate = this.parseTime(this.currentEnd.toString());
    let tickValues = [];
    for(let year = this.currentStart; year <= this.currentEnd; year++){
        tickValues.push(this.parseTime(year.toString()));
    }

    this.xScale = d3.scaleTime()
        .domain([startDate, endDate])
        .range([0, svgWidth - this.margin.right - this.margin.left]);
    
    this.yScale = d3.scaleLinear()
        .domain(this.getRange())
        .range([svgHeight - this.margin.top - this.margin.bottom, 0])
        .nice();
    
    curveSvg.append('g')
        .attr('id', 'curve-xAxis')
        .attr('transform', 'translate(' + this.margin.left + "," + (svgHeight - this.margin.bottom) + ")")
        .call(d3.axisBottom().scale(this.xScale).tickValues(tickValues).tickFormat(d3.timeFormat('%Y')));
    
    curveSvg.append('g')
        .attr('id', 'curve-yAxis')
        .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
        .call(d3.axisLeft().scale(this.yScale));
    
    curveSvg.append('text')
        .attr('class', 'axisText')
        .attr('transform', `rotate(-90) translate(${-this.margin.top - this.yScale.range()[0]/2}, ${this.margin.left/2})`)
        .text(this.type);
}

curvechart.setStrokeGroup = function(){
    d3.select('#curvechart')
        .select('#curve')
        .append('g')
        .attr('id', 'strokeGroup')
        .attr('transform', "translate(" + this.margin.left + "," + this.margin.top + ")")
        .selectAll('g')
        .data(Array.from(this.countrySet))
        .enter()
        .append('g')
        .attr('class', function(name){
            return curvechart.normalize(name) + 'Curve';
        })
        .attr('opacity', 1);
}
/**
 * draw the chart based on this.localData
 * // @param {boolean} updateOthers whether to call the update functions in other charts. Default to false
 */
curvechart.draw = function(){
    d3.select('#curvechart')
        .select('#curve')
        .selectAll('*')
        .remove();
    this.setScale();
    this.setStrokeGroup();
    for(let year = this.currentStart + 1; year <= this.now; year++){
        this.__update__(0, year);
    }
}


/**
 * get the range using this.localData and this.type
 */
curvechart.getRange = function(){
    let minVal, maxVal;
    let first = true;
    for(let year in this.localData){
        for(let country in this.localData[year]){
            let value = this.localData[year][country][this.type];
            if(first){
                minVal = value;
                maxVal = value;
                first = false;
            }
            else{
                minVal = Math.min(minVal, value);
                maxVal = Math.max(maxVal, value);
            }
        }
    }
    return [minVal, maxVal];
}



/**
 * extent each curve to crtyear
 * it is used internally
 * @param {float} duration how long the transition will be
 * @param {number} crtyear draw the period between [crtyear-1, crtyear]
 */
curvechart.__update__ = function(duration, crtyear = curvechart.now){
    let lineGen = d3.line()
        .curve(d3.curveCatmullRomOpen);
    
    d3.select('#strokeGroup')
        .selectAll('g')
        .each(function(country){
            if(curvechart.existQuery(crtyear, country) && curvechart.existQuery(crtyear-1, country)){
                d3.select(this)
                    .append('path')
                    .datum(function(){
                        let yesPos = position(crtyear - 1, country);
                        let nowPos = position(crtyear, country);
                        if(Math.abs(yesPos[1] - nowPos[1]) < curvechart.EPSILON){
                            return [yesPos, yesPos, nowPos, nowPos];
                        }
                        let prevYesPos = position(crtyear - 2, country);
                        let tmrPos = position(crtyear + 1, country);
                        prevYesPos = prevYesPos === null ? yesPos : prevYesPos;
                        tmrPos = tmrPos === null ? nowPos : tmrPos;
                        return [prevYesPos, yesPos, nowPos, tmrPos];
                    })
                    .attr('d', lineGen)
                    .datum(function(){
                        return country; // abandon path data
                    })
                    .transition()
                    .duration(duration)
                    .attrTween('stroke-dasharray', tweenDash);
            }
        });
    
    function tweenDash(){
        let l = this.getTotalLength();
        return d3.interpolateString('0 ' + l, l + ' ' + l);
    }

    function position(year, country){
        if(curvechart.existQuery(year, country)){
            let xpos = curvechart.xScale(curvechart.parseTime(year.toString()));
            let ypos = curvechart.yScale(curvechart.localData[year][country][curvechart.type]);
            return [xpos, ypos];
        }
        else{
            return null;
        }
    }
}

curvechart.existQuery = function(year, country){
    year = year.toString();
    return curvechart.localData.hasOwnProperty(year) && curvechart.localData[year].hasOwnProperty(country);
}

/**
 * update the data using a transition
 * fetch the global wholeYearData
 * and plot the data
 */
curvechart.update = function(duration){
    // reset local data
    this.setLocalData();
    this.draw();
}