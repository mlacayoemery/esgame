class Gradiant {
    colors: string[];
}

let gradiants: Map<string, Gradiant> = new Map<string, Gradiant>();
gradiants.set('blue', { colors: ['#d2b188', '#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']});
gradiants.set('green', { colors: ['#d2b188', '#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c']});
gradiants.set('orange', { colors: ['#d2b188', '#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603']});
gradiants.set('purple', { colors: ['#d2b188', '#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f']});
gradiants.set('red', { colors: ['#d2b188', '#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15']});
gradiants.set('yellow', { colors: ['#d2b188', '#F8F27D', '#F7D068', '#F6A825', '#AE5322', '#670B0D']});

export default gradiants;

export enum DefaultGradients {
	Blue = 'blue',
	Green = 'green',
	Orange = 'orange',
	Purple = 'purple',
	Red = 'red',
	Yellow = 'yellow'
}


