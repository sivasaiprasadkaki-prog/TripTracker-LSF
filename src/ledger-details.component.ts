import { Component, ChangeDetectionStrategy, input, output, signal, inject, computed, OnInit, effect, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Ledger, Entry } from './app.component';
import { Subscription } from 'rxjs';
import { FirebaseService } from './services/firebase.service';

interface EntryWithBalance extends Entry {
  balance: number;
}

interface AttachmentPreview {
  name: string;
  url: string; // base64 data URL for new, firebase storage URL for existing
  file?: File; // the actual file for new uploads
}

@Component({
  selector: 'app-ledger-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <style>
      .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      .hide-scrollbar::-webkit-scrollbar { display: none; }
      .shadow-inner-top { box-shadow: inset 0 1px 3px 0 rgb(0 0 0 / 0.05); }
      .dark .shadow-inner-top { box-shadow: inset 0 1px 3px 0 rgb(255 255 255 / 0.05); }
    </style>
    <div class="font-sans flex flex-col h-full text-slate-900 dark:text-slate-100 animate-page-in">
      <main class="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6 flex-shrink-0">
          <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400">Cash In</h3>
            <p class="text-3xl font-bold text-green-500 mt-2">+₹{{ totalCashIn() | number:'1.2-2' }}</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400">Cash Out</h3>
            <p class="text-3xl font-bold text-red-500 mt-2">-₹{{ totalCashOut() | number:'1.2-2' }}</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400">Balance</h3>
            <p class="text-3xl font-bold text-indigo-500 mt-2">₹{{ balance() | number:'1.2-2' }}</p>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th scope="col" class="p-4 w-10"><label class="flex items-center"><input type="checkbox" [checked]="areAllSelected()" (change)="toggleSelectAll($event)" class="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500 bg-slate-100 dark:bg-slate-700"><span class="sr-only">Select all</span></label></th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Date</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Details</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Category</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Mode</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-right">Cash In</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-right">Cash Out</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-right">Balance</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                @if (entriesWithBalance().length > 0) { @for (entry of entriesWithBalance(); track entry.id) { <tr class="border-b border-slate-200 dark:border-slate-800" [class.bg-teal-50]="isSelected(entry.id)" [class.dark:bg-teal-900/20]="isSelected(entry.id)"><td class="p-4"><label class="flex items-center"><input type="checkbox" [checked]="isSelected(entry.id)" (change)="toggleSelection(entry.id)" class="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500 bg-slate-100 dark:bg-slate-700"><span class="sr-only">Select row</span></label></td><td class="px-6 py-4"><div class="font-medium">{{ entry.date | date: 'mediumDate' }}</div><div class="text-xs text-slate-500 dark:text-slate-400">{{ entry.time }}</div></td><td class="px-6 py-4 font-medium"><div class="flex items-center"><span>{{ entry.details }}</span> @if (entry.attachments && entry.attachments.length > 0) {<button (click)="openAttachmentViewer(entry)" class="ml-2 text-slate-400 hover:text-teal-500 dark:hover:text-teal-400"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.53 9.53l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.452a1.125 1.125 0 0 0 1.59 1.591l3.455-3.553a3 3 0 0 0 0-4.242Z" clip-rule="evenodd" /></svg></button>}</div></td><td class="px-6 py-4">{{ entry.category }}</td><td class="px-6 py-4">{{ entry.mode }}</td><td class="px-6 py-4 font-mono text-right text-green-600 dark:text-green-500">@if (entry.type === 'cash-in') { ₹{{ entry.amount | number:'1.2-2' }} }</td><td class="px-6 py-4 font-mono text-right text-red-600 dark:text-red-500">@if (entry.type === 'cash-out') { ₹{{ entry.amount | number:'1.2-2' }} }</td><td class="px-6 py-4 font-mono text-right">₹{{ entry.balance | number:'1.2-2' }}</td><td class="px-6 py-4">@if (selectedEntries().length === 0) {<div class="flex items-center justify-center space-x-2"><button (click)="openEditEntryModal(entry)" class="p-2 text-slate-500 dark:text-slate-400 rounded-full transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-teal-600 dark:hover:text-teal-400" aria-label="Edit entry"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" /></svg></button><button (click)="deleteEntry(entry.id)" class="p-2 text-slate-500 dark:text-slate-400 rounded-full transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400" aria-label="Delete entry"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg></button></div>}</td></tr> } } @else { <tr><td colspan="9" class="text-center py-12 px-6"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4 mx-auto"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12.75h.75m2.25 0h.75m2.25 0h.75m2.25 0h.75M8.25 17.25h.75m2.25 0h.75m2.25 0h.75m2.25 0h.75M8.25 21v-3.75c0-.621.504-1.125 1.125-1.125H14.25c.621 0 1.125.504 1.125 1.125V21m-4.875-1.5h.008v.008h-.008v-.008ZM9.75 16.5h.008v.008H9.75v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008ZM9.75 19.5h.008v.008H9.75v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008ZM8.25 4.5h7.5a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25-2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-7.5a2.25 2.25 0 0 1 2.25-2.25Z" /></svg><p class="font-semibold text-slate-700 dark:text-slate-200">No entries yet</p><p class="text-slate-500 dark:text-slate-400 mt-1">Click "Add Cash In" or "Add Cash Out" to begin.</p></td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      </main>

      @if (selectedEntries().length === 0) {
        <footer class="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-inner-top">
            <div class="flex items-center h-20 gap-4 px-4 sm:px-8">
                <button (click)="openAddEntryModal('cash-in')" class="btn btn-success flex-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
                    <span>Cash In</span>
                </button>
                <button (click)="openAddEntryModal('cash-out')" class="btn btn-danger flex-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M4 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 10Z" clip-rule="evenodd" /></svg>
                    <span>Cash Out</span>
                </button>
            </div>
        </footer>
      } @else {
        <footer class="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-inner-top animate-page-in">
            <div class="flex items-center h-20 px-4 space-x-4">
                <button (click)="clearSelection()" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Cancel selection">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                </button>
                <span class="font-semibold">{{ selectedEntries().length }} selected</span>
                <div class="flex-grow"></div>
                <button (click)="deleteSelectedEntries()" class="p-2 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition-colors" aria-label="Delete selected entries">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
                </button>
            </div>
        </footer>
      }
    </div>

    @if (isDeleteModalVisible()) { 
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-modal-in">
          <div (click)="$event.stopPropagation()" class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm m-4">
              <div class="p-8 text-center">
                  <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
                      <svg class="h-6 w-6 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                  </div>
                  <h3 class="text-xl font-bold mt-5 text-slate-800 dark:text-slate-100">Delete {{ deleteContext() }}</h3>
                  <p class="text-sm text-slate-500 dark:text-slate-400 mt-2">Are you sure you want to delete this? This action cannot be undone.</p>
                  <div class="mt-8 flex justify-center items-center gap-4">
                      <button (click)="cancelDelete()" type="button" class="btn btn-neutral">Cancel</button>
                      <button (click)="confirmDelete()" type="button" class="btn btn-danger">Confirm Delete</button>
                  </div>
              </div>
          </div>
      </div> 
    }

    @if (isEntryModalVisible()) { <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-modal-in" (click)="closeEntryModal()"><div (click)="$event.stopPropagation()" class="bg-slate-50 dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl m-4 max-h-[90vh] flex flex-col"><form [formGroup]="entryForm" (ngSubmit)="onSaveEntry()" class="flex flex-col flex-1 min-h-0"><div class="p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0"><h2 class="text-2xl font-bold text-slate-800 dark:text-white">{{ entryModalTitle() }}</h2></div><div class="p-6 flex-grow overflow-y-auto text-slate-600 dark:text-slate-300 scroll-smooth hide-scrollbar"><div class="grid grid-cols-2 gap-4 mb-6"><button type="button" (click)="entryForm.controls['type'].setValue('cash-in')" class="px-4 py-2 rounded-lg font-semibold transition-colors text-center bg-slate-100 dark:bg-slate-700 border" [class.text-green-600]="entryForm.value.type === 'cash-in'" [class.border-green-500]="entryForm.value.type === 'cash-in'" [class.dark:text-green-400]="entryForm.value.type === 'cash-in'" [class.text-slate-600]="entryForm.value.type !== 'cash-in'" [class.border-slate-300]="entryForm.value.type !== 'cash-in'" [class.dark:text-slate-400]="entryForm.value.type !== 'cash-in'" [class.dark:border-slate-600]="entryForm.value.type !== 'cash-in'">Cash In</button><button type="button" (click)="entryForm.controls['type'].setValue('cash-out')" class="px-4 py-2 rounded-lg font-semibold transition-colors text-center bg-slate-100 dark:bg-slate-700 border" [class.text-red-600]="entryForm.value.type === 'cash-out'" [class.border-red-500]="entryForm.value.type === 'cash-out'" [class.dark:text-red-400]="entryForm.value.type === 'cash-out'" [class.text-slate-600]="entryForm.value.type !== 'cash-out'" [class.border-slate-300]="entryForm.value.type !== 'cash-out'" [class.dark:text-slate-400]="entryForm.value.type !== 'cash-out'" [class.dark:border-slate-600]="entryForm.value.type !== 'cash-out'">Cash Out</button></div><div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5"><div><label for="date" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Date</label><div class="relative"><input formControlName="date" id="date" type="date" required class="w-full px-3 py-2 pr-10 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"><div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-slate-400"><path fill-rule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5h10.5a.75.75 0 0 0 0-1.5H4.75a.75.75 0 0 0 0 1.5Z" clip-rule="evenodd" /></svg></div></div></div><div><label for="time" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Time</label><div class="relative"><input formControlName="time" id="time" type="time" required class="w-full px-3 py-2 pr-10 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"><div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-slate-400"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd" /></svg></div></div></div><div class="md:col-span-2"><label for="details" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Details</label><input formControlName="details" id="details" type="text" required class="w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., Dinner with team"></div><div><label for="category" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Category</label><select formControlName="category" id="category" required class="w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"><option>Food</option><option>Transport</option><option>Advance</option><option>Health Care</option><option value="Custom">Custom</option></select></div>@if (entryForm.value.category === 'Custom') {<div><label for="customCategory" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Custom Category</label><input formControlName="customCategory" id="customCategory" type="text" class="w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., Shopping"></div>} @else {<div><label for="mode" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Mode</label><input formControlName="mode" id="mode" type="text" required class="w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., Cash, Card, UPI"></div>}<div class="md:col-span-2"><label for="amount" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Amount (₹)</label><input formControlName="amount" id="amount" type="number" required class="w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="0.00"></div><div class="md:col-span-2"><label class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Bill Attachments (up to 5)</label><div class="mt-2 flex items-center justify-center w-full"><label for="dropzone-file" class="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-lg bg-slate-200/50 dark:bg-slate-700/50" [class.cursor-pointer]="!isProcessingAttachments()" [class.hover:bg-slate-200]="!isProcessingAttachments()" [class.dark:hover:bg-slate-700]="!isProcessingAttachments()"><div class="flex flex-col items-center justify-center pt-5 pb-6">@if(isProcessingAttachments()) {<svg class="animate-spin h-8 w-8 mb-4 text-slate-500 dark:text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p class="text-sm text-slate-500 dark:text-slate-400">Processing images...</p>} @else {<svg class="w-8 h-8 mb-4 text-slate-500 dark:text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg><p class="mb-2 text-sm text-slate-500 dark:text-slate-400"><span class="font-semibold">Click to upload</span> or drag and drop</p><p class="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, or GIF</p>}</div><input id="dropzone-file" type="file" class="hidden" multiple (change)="onFileSelected($event)" accept="image/*" [disabled]="isProcessingAttachments()" /></label></div> @if (attachmentPreviews().length > 0) {<div class="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-4">@for (preview of attachmentPreviews(); track preview.url) {<div class="relative group"><img [src]="preview.url" [alt]="preview.name" class="h-24 w-full object-cover rounded-lg"><div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><button (click)="removeAttachment(preview.url)" type="button" class="text-white p-1 bg-red-600/80 rounded-full hover:bg-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg></button></div></div>}</div>}</div><div class="md:col-span-2"><label for="notes" class="block text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">Notes (Optional)</label><textarea formControlName="notes" id="notes" rows="3" class="w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="Any extra details..."></textarea></div></div></div>@if (entryModalErrorMessage()) {
                <div class="px-6 pb-4">
                    <p class="p-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300 rounded-md text-sm text-center animate-shake">{{ entryModalErrorMessage() }}</p>
                </div>
                }<div class="py-4 px-6 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-4 flex-shrink-0"><button type="button" (click)="closeEntryModal()" [disabled]="isSavingEntry()" class="btn btn-neutral">Cancel</button><button type="submit" [disabled]="entryForm.invalid || isSavingEntry()" class="btn btn-primary flex items-center justify-center min-w-[120px]"> @if (isSavingEntry()) { <svg class="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>Saving...</span> } @else { <span>{{ entryModalSubmitButtonText() }}</span> } </button></div></form></div></div> }
    
    @if (isAttachmentViewerVisible()) { <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-modal-in" (click)="closeAttachmentViewer()"><div (click)="$event.stopPropagation()" class="relative w-full h-full max-w-4xl max-h-4xl p-4 sm:p-8"><img [src]="currentAttachmentUrl()" alt="Attachment Preview" class="w-full h-full object-contain"><button (click)="closeAttachmentViewer()" class="absolute top-2 right-2 sm:top-4 sm:right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg></button>@if (attachmentsForViewer().length > 1) {<button (click)="showPrevAttachment()" class="absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 text-white bg-black/50 rounded-full p-2 hover:bg-black/80"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1 0 1.06L9.06 10l3.73 3.71a.75.75 0 1 1-1.06 1.06L7.47 10.53a.75.75 0 0 1 0-1.06l4.26-4.24a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" /></svg></button><button (click)="showNextAttachment()" class="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 text-white bg-black/50 rounded-full p-2 hover:bg-black/80"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 0-1.06L10.94 10 7.21 6.29a.75.75 0 1 1 1.06-1.06l4.24 4.24a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0Z" clip-rule="evenodd" /></svg></button><div class="absolute bottom-2 left-1/2 -translate-x-1/2 text-white bg-black/50 rounded-full px-3 py-1 text-sm">{{ currentAttachmentIndex() + 1 }} / {{ attachmentsForViewer().length }}</div> }</div></div> }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DecimalPipe]
})
export class LedgerDetailsComponent implements OnInit, OnDestroy {
  ledger = input.required<Ledger>();

  private fb = inject(FormBuilder);
  private firebaseService = inject(FirebaseService);
  
  entries = signal<Entry[]>([]);
  isEntryModalVisible = signal(false);
  editingEntry = signal<Entry | null>(null);
  isAttachmentViewerVisible = signal(false);
  attachmentsForViewer = signal<string[]>([]);
  currentAttachmentIndex = signal(0);
  selectedEntries = signal<string[]>([]);
  attachmentPreviews = signal<AttachmentPreview[]>([]);
  private categorySubscription?: Subscription;

  isSavingEntry = signal(false);
  entryModalErrorMessage = signal<string | null>(null);
  isProcessingAttachments = signal(false);

  entryToDeleteId = signal<string | null>(null);
  isDeleteSelectedConfirmVisible = signal<boolean>(false);
  
  isDeleteModalVisible = computed(() => this.entryToDeleteId() !== null || this.isDeleteSelectedConfirmVisible());
  deleteContext = computed(() => {
    if (this.entryToDeleteId()) return 'entry';
    if (this.isDeleteSelectedConfirmVisible()) return 'selected entries';
    return '';
  });

  entryModalTitle = computed(() => this.editingEntry() ? 'Edit Entry' : 'Add New Entry');
  entryModalSubmitButtonText = computed(() => this.editingEntry() ? 'Update' : 'Add');
  currentAttachmentUrl = computed(() => this.attachmentsForViewer()[this.currentAttachmentIndex()]);

  totalCashIn = computed(() => this.entries().filter(e => e.type === 'cash-in').reduce((sum, e) => sum + e.amount, 0));
  totalCashOut = computed(() => this.entries().filter(e => e.type === 'cash-out').reduce((sum, e) => sum + e.amount, 0));
  balance = computed(() => this.totalCashIn() - this.totalCashOut());

  entriesWithBalance = computed(() => {
    let runningBalance = 0;
    const sortedEntries = [...this.entries()].sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) return dateComparison;
      return a.time.localeCompare(b.time);
    });

    return sortedEntries.map(entry => {
      runningBalance += entry.type === 'cash-in' ? entry.amount : -entry.amount;
      return { ...entry, balance: runningBalance };
    });
  });
  
  areAllSelected = computed(() => {
    const numEntries = this.entries().length;
    return numEntries > 0 && this.selectedEntries().length === numEntries;
  });

  constructor() {
    effect(() => {
      const currentLedger = this.ledger();
      if (currentLedger) {
        this.fetchEntries(currentLedger.id);
      } else {
        this.entries.set([]);
      }
      this.selectedEntries.set([]);
    }, { allowSignalWrites: true });
  }
  
  ngOnInit() {
    const categoryControl = this.entryForm.get('category');
    if (categoryControl) {
      this.categorySubscription = categoryControl.valueChanges.subscribe(category => {
        this.updateCategoryDependentValidators(category);
      });
    }
  }
  
  ngOnDestroy() {
    this.categorySubscription?.unsubscribe();
  }

  async fetchEntries(ledgerId: string) {
    // TODO: Add loading state
    const entriesData = await this.firebaseService.getEntries(ledgerId);
    this.entries.set(entriesData as Entry[]);
  }

  private updateCategoryDependentValidators(category: string | null | undefined): void {
    const modeControl = this.entryForm.get('mode');
    const customCategoryControl = this.entryForm.get('customCategory');
    if (!modeControl || !customCategoryControl) return;
    if (category === 'Custom') {
      modeControl.clearValidators();
      modeControl.setValue(''); 
      customCategoryControl.setValidators([Validators.required]);
    } else {
      modeControl.setValidators([Validators.required]);
      customCategoryControl.clearValidators();
      customCategoryControl.setValue('');
    }
    modeControl.updateValueAndValidity();
    customCategoryControl.updateValueAndValidity();
  }

  private formatTimeForInput(timeString: string | undefined | null): string {
    if (!timeString) return '';
    if (/^\\d{2}:\\d{2}$/.test(timeString)) return timeString;
    const date = new Date(`2000-01-01 ${timeString}`);
    if (isNaN(date.getTime())) return '';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private getFileNameFromUrl(url: string): string {
    try {
      const decodedUrl = decodeURIComponent(url);
      const urlPath = new URL(decodedUrl).pathname;
      const segments = urlPath.split('/');
      const fileNameWithTimestamp = segments.pop() || 'attachment';
      return fileNameWithTimestamp.substring(fileNameWithTimestamp.indexOf('_') + 1);
    } catch {
      return 'attachment';
    }
  }

  openAddEntryModal(type: 'cash-in' | 'cash-out') {
    this.editingEntry.set(null);
    this.entryModalErrorMessage.set(null);
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    this.entryForm.reset({ type, date: now.toISOString().split('T')[0], time: `${hours}:${minutes}`, details: '', category: 'Food', mode: 'Cash', amount: null, notes: '' });
    this.updateCategoryDependentValidators('Food');
    this.attachmentPreviews.set([]);
    this.isEntryModalVisible.set(true);
  }

  openEditEntryModal(entry: Entry) {
    this.editingEntry.set(entry);
    this.entryModalErrorMessage.set(null);
    const categoryExists = ['Food', 'Transport', 'Advance', 'Health Care'].includes(entry.category);
    const categoryValue = categoryExists ? entry.category : 'Custom';
    this.entryForm.reset({ ...entry, time: this.formatTimeForInput(entry.time), category: categoryValue, customCategory: categoryExists ? '' : entry.category });
    this.updateCategoryDependentValidators(categoryValue);
    const previews = (entry.attachments || []).map(url => ({ name: this.getFileNameFromUrl(url), url, file: undefined }));
    this.attachmentPreviews.set(previews);
    this.isEntryModalVisible.set(true);
  }

  closeEntryModal() {
    this.isEntryModalVisible.set(false);
    this.editingEntry.set(null);
    this.attachmentPreviews.set([]);
  }

  entryForm = this.fb.group({
    type: ['cash-out' as 'cash-in' | 'cash-out', Validators.required],
    date: ['', Validators.required],
    time: ['', Validators.required],
    details: ['', Validators.required],
    category: ['Food', Validators.required],
    customCategory: [''],
    mode: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    notes: [''],
  });

  private async compressImage(file: File, maxSizeInMB = 1): Promise<File> {
    const maxSizeBytes = maxSizeInMB * 1024 * 1024;
    if (file.size <= maxSizeBytes || !file.type.startsWith('image/')) {
      return file; 
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(image.src); 
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'));
        }

        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        let { width, height } = image;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Canvas to Blob conversion failed'));
            }
            const newFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(newFile.size > maxSizeBytes ? file : newFile);
          },
          'image/jpeg',
          0.8 
        );
      };
      image.onerror = (error) => {
        URL.revokeObjectURL(image.src);
        reject(error);
      };
    });
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files).slice(0, 5 - this.attachmentPreviews().length);
    if (files.length === 0) return;

    this.isProcessingAttachments.set(true);
    this.entryModalErrorMessage.set(null);

    try {
      const compressionPromises = files.map(file => this.compressImage(file, 1));
      const compressedFiles = await Promise.all(compressionPromises);

      const readingPromises = compressedFiles.map(compressedFile => {
        return new Promise<{ name: string; url: string; file: File }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: compressedFile.name, url: reader.result as string, file: compressedFile });
          reader.onerror = reject;
          reader.readAsDataURL(compressedFile);
        });
      });

      const newPreviews = await Promise.all(readingPromises);
      this.attachmentPreviews.update(current => [...current, ...newPreviews]);
    } catch (error) {
      console.error('Error processing image:', error);
      this.entryModalErrorMessage.set('An error occurred while processing images.');
    } finally {
      this.isProcessingAttachments.set(false);
      input.value = '';
    }
  }


  removeAttachment(url: string) {
    this.attachmentPreviews.update(current => current.filter(p => p.url !== url));
  }
  
  async onSaveEntry() {
    if (this.entryForm.invalid) return;
    
    this.isSavingEntry.set(true);
    this.entryModalErrorMessage.set(null);

    try {
      const editing = this.editingEntry();
      const entryId = editing ? editing.id : crypto.randomUUID();
      const ledgerId = this.ledger().id;
      
      const existingAttachments = editing?.attachments || [];
      const finalAttachmentUrls: string[] = [];
      
      const currentPreviewUrls = new Set(this.attachmentPreviews().map(p => p.url));
      const attachmentsToDelete = existingAttachments.filter(url => !currentPreviewUrls.has(url));
      
      for (const url of attachmentsToDelete) {
        await this.firebaseService.deleteAttachment(url).catch(e => console.error("Failed to delete attachment", e));
      }
      
      for (const preview of this.attachmentPreviews()) {
        if (preview.file) {
          const newUrl = await this.firebaseService.uploadAttachment(ledgerId, entryId, preview.file);
          finalAttachmentUrls.push(newUrl);
        } else {
          finalAttachmentUrls.push(preview.url);
        }
      }
      
      const formValue = this.entryForm.getRawValue();
      const finalCategory = formValue.category === 'Custom' ? (formValue.customCategory || 'Custom') : formValue.category;
      
      const entryData: Omit<Entry, 'id'> = {
        details: formValue.details!,
        date: formValue.date!,
        time: formValue.time!,
        type: formValue.type!,
        category: finalCategory!,
        mode: formValue.mode!,
        amount: Number(formValue.amount!),
        attachments: finalAttachmentUrls,
        notes: formValue.notes || ''
      };

      await this.firebaseService.saveEntry(ledgerId, entryId, entryData);
      
      await this.fetchEntries(ledgerId);
      this.closeEntryModal();
    } catch (error: any) {
        console.error("Error saving entry:", error);
        let message = 'An unexpected error occurred. Please try again.';
        if (error && error.code) {
          switch (error.code) {
            case 'storage/retry-limit-exceeded':
              message = 'Upload timed out. Please check your network connection and try again.';
              break;
            case 'storage/unauthorized':
              message = 'Permission denied. You do not have permission to upload files.';
              break;
            case 'storage/canceled':
              message = 'The file upload was canceled.';
              break;
            case 'permission-denied':
               message = 'Permission denied. You do not have permission to save data.';
               break;
            case 'unavailable':
                message = 'The service is currently unavailable. Please try again later.';
                break;
            default:
              message = `An error occurred (${error.code}). Please try again.`;
              break;
          }
        }
        this.entryModalErrorMessage.set(message);
    } finally {
        this.isSavingEntry.set(false);
    }
  }

  deleteEntry(id: string) { this.entryToDeleteId.set(id); }
  openAttachmentViewer(entry: Entry) { if (entry.attachments && entry.attachments.length > 0) { this.attachmentsForViewer.set(entry.attachments); this.currentAttachmentIndex.set(0); this.isAttachmentViewerVisible.set(true); } }
  closeAttachmentViewer() { this.isAttachmentViewerVisible.set(false); }
  showNextAttachment() { this.currentAttachmentIndex.update(i => (i + 1) % this.attachmentsForViewer().length); }
  showPrevAttachment() { this.currentAttachmentIndex.update(i => (i - 1 + this.attachmentsForViewer().length) % this.attachmentsForViewer().length); }

  toggleSelection(id: string) { this.selectedEntries.update(current => { const newSelection = new Set(current); if (newSelection.has(id)) { newSelection.delete(id); } else { newSelection.add(id); } return Array.from(newSelection); }); }
  toggleSelectAll(event: Event) { const checkbox = event.target as HTMLInputElement; if (checkbox.checked) { this.selectedEntries.set(this.entries().map(e => e.id)); } else { this.selectedEntries.set([]); } }
  isSelected(id: string): boolean { return this.selectedEntries().includes(id); }
  clearSelection() { this.selectedEntries.set([]); }
  
  deleteSelectedEntries() { this.isDeleteSelectedConfirmVisible.set(true); }

  cancelDelete() {
    this.entryToDeleteId.set(null);
    this.isDeleteSelectedConfirmVisible.set(false);
  }

  async confirmDelete() {
    const ledgerId = this.ledger().id;
    const deletionPromises: Promise<any>[] = [];

    if (this.entryToDeleteId()) {
      const entryId = this.entryToDeleteId()!;
      deletionPromises.push(this.deleteEntryWithAttachments(ledgerId, entryId));
    } else if (this.isDeleteSelectedConfirmVisible()) {
      const selectedIds = this.selectedEntries();
      selectedIds.forEach(id => {
        deletionPromises.push(this.deleteEntryWithAttachments(ledgerId, id));
      });
      this.clearSelection();
    }

    await Promise.all(deletionPromises);
    await this.fetchEntries(ledgerId);
    this.cancelDelete();
  }

  private async deleteEntryWithAttachments(ledgerId: string, entryId: string): Promise<void> {
    const entryToDelete = this.entries().find(e => e.id === entryId);
    if (entryToDelete?.attachments) {
      const attachmentDeletions = entryToDelete.attachments.map(url =>
        this.firebaseService.deleteAttachment(url).catch(e => console.error(`Failed to delete attachment ${url}`, e))
      );
      await Promise.all(attachmentDeletions);
    }
    await this.firebaseService.deleteEntry(ledgerId, entryId);
  }
}