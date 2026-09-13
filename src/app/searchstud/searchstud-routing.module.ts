import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SearchstudPage } from './searchstud.page';

const routes: Routes = [
  {
    path: '',
    component: SearchstudPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SearchstudPageRoutingModule {}
  