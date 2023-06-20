import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NavigationComponent } from './layout/navigation/navigation.component';
import { ConfiguratorComponent } from './configurator/configurator.component';
import { GridLevelComponent } from './level/grid-level/grid-level.component';
import { SvgLevelComponent } from './level/svg-level/svg-level.component';
import { StartComponent } from './start/start.component';

const routes: Routes = [
	{
		path: '',
		component: StartComponent
	},
	{
		path: 'navigation',
		component: NavigationComponent
	},
	{
		path: 'static-game',
		component: GridLevelComponent
	}, 
	{
		path: 'dynamic-game',
		component: SvgLevelComponent
	}, 
	{
		path: 'configurator',
		component: ConfiguratorComponent
	},
];

@NgModule({
	imports: [RouterModule.forRoot(routes)],
	exports: [RouterModule]
})
export class AppRoutingModule { }
