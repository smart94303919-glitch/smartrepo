import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SecAPage } from './sec-a.page';

const routes: Routes = [
  {
    path: '',
    component: SecAPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SecAPageRoutingModule {}
