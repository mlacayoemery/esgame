import { APP_INITIALIZER, Injectable, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ConfigService } from './services/config.service';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { GridFieldComponent } from './field/grid-field/grid-field.component';
import { ProductionTypeButtonComponent } from './product-type-button/production-type-button.component';
import { ScoreBoardComponent } from './score-board/score-board.component';
import { LegendBoardComponent } from './legend-board/legend-board.component';
import { ButtonDirective } from './shared/button.directive';
import { HelpComponent } from './help/help.component';
import { ScoreIndicatorComponent } from './score-indicator/score-indicator.component';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MissingTranslationHandler, MissingTranslationHandlerParams, provideMissingTranslationHandler, provideTranslateService, TranslateDirective, TranslatePipe } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { HttpClientModule } from '@angular/common/http';
import { SvgGameBoardComponent } from './game-board/svg-game-board/svg-game-board.component';
import { GridGameBoardComponent } from './game-board/grid-game-board/grid-game-board.component';
import { SvgFieldComponent } from './field/svg-field/svg-field.component';
import { GridLevelComponent } from './level/grid-level/grid-level.component';
import { SvgLevelComponent } from './level/svg-level/svg-level.component';
import { LoadingIndicatorComponent } from './loading-indicator/loading-indicator.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LevelIndicatorComponent } from './level-indicator/level-indicator.component';
import { HomeComponent } from './home/home.component';

@Injectable()
export class MyMissingTranslationHandler implements MissingTranslationHandler {
	handle(params: MissingTranslationHandlerParams): any {
	  return params.key;
	}
  }

@NgModule({
	declarations: [
		AppComponent,
		GridFieldComponent,
		ProductionTypeButtonComponent,
		ScoreBoardComponent,
		LegendBoardComponent,
		ButtonDirective,
		HelpComponent,
		ScoreIndicatorComponent,
		SvgFieldComponent,
		SvgGameBoardComponent,
		GridGameBoardComponent,
		GridLevelComponent,
		SvgLevelComponent,
		LoadingIndicatorComponent,
		LevelIndicatorComponent,
		HomeComponent,
	],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		AppRoutingModule,
		HttpClientModule,
		MatIconModule,
		MatButtonModule,
		MatProgressSpinnerModule,
		FormsModule,
		ReactiveFormsModule,
		TranslatePipe,
		TranslateDirective,
	],
	providers: [
		provideTranslateService({
			fallbackLang: 'de',
			loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
			missingTranslationHandler: provideMissingTranslationHandler(MyMissingTranslationHandler),
		}),
		{
			provide: APP_INITIALIZER,
			useFactory: (config: ConfigService) => () => config.load(),
			deps: [ConfigService],
			multi: true
		}
	],
	bootstrap: [AppComponent]
})
export class AppModule { }

