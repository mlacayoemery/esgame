import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Layout2Component } from './layout/layout2/layout2.component';
import { Layout1Component } from './layout/layout1/layout1.component';
import { NavigationComponent } from './layout/navigation/navigation.component';

const routes: Routes = [
	{
		path: '',
		component: NavigationComponent
	},
	{
		path: 'layout2',
		component: Layout2Component
	},
	{
		path: 'layout1',
		component: Layout1Component
	}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
