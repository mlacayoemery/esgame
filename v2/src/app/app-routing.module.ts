import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConfiguratorComponent } from './configurator/configurator.component';
import { GridLevelComponent } from './level/grid-level/grid-level.component';
import { SvgLevelComponent } from './level/svg-level/svg-level.component';
import { StartComponent } from './start/start.component';

const routes: Routes = [
	{
		// Default: launch straight into Configuration 2 (the static grid game).
		path: '',
		component: GridLevelComponent
	},
	{
		// The start / configuration landing page (was the default route).
		path: 'config',
		component: StartComponent
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
	{
		// Unknown paths fall back to the game.
		path: '**',
		redirectTo: ''
	},
];

@NgModule({
	imports: [RouterModule.forRoot(routes)],
	exports: [RouterModule]
})
export class AppRoutingModule { }
