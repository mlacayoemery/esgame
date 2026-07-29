import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GridLevelComponent } from './level/grid-level/grid-level.component';
import { SvgLevelComponent } from './level/svg-level/svg-level.component';
import { HomeComponent } from './home/home.component';

const routes: Routes = [
	{
		// Root landing: grid or dynamic game per config.json `defaultMode` (default grid).
		path: '',
		component: HomeComponent
	},
	{
		// The start / configuration landing page (was the default route). Lazy: it is
		// not on the path to the game and owns the last eager MatSelect/MatFormField use.
		path: 'config',
		loadChildren: () => import('./start/start.module').then(m => m.StartModule)
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
		// Lazy: the configurator is an authoring tool, not on the path to the game,
		// and it owns the heaviest Material widgets (stepper/input/checkbox/slider).
		path: 'configurator',
		loadChildren: () => import('./configurator/configurator.module').then(m => m.ConfiguratorModule)
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
