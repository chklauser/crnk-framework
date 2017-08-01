import {Subject} from 'rxjs/Subject';
import {Observable} from 'rxjs/Observable';
import * as _ from 'lodash';
import 'rxjs/add/operator/zip';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinct';
import 'rxjs/add/operator/switch';
import {
	Direction,
	FilteringParam,
	ManyQueryResult,
	NgrxJsonApiService,
	Query,
	Resource,
	SortingParam
} from 'ngrx-json-api';
import {NgrxBindingUtils} from './crnk.binding.utils';
// TODO get rid of this? or support multiple ones, only dependency to primeng here...
import {LazyLoadEvent} from 'primeng/primeng';

export interface DataTableBindingConfig {

	queryId: string;

	/**
	 * query to use if specified query is not already in the store
	 */
	baseQuery?: Query;
}

export class DataTableBinding {

	public result$: Observable<ManyQueryResult> = new Subject();

	public selectedResource: Resource;

	private baseQuery: Query = null;

	private latestQuery: Query = null;

	private num = 0;

	constructor(private ngrxJsonApiService: NgrxJsonApiService, private config: DataTableBindingConfig,
				private utils: NgrxBindingUtils) {
		if (!this.config.queryId) {
			throw new Error('no queryId specified in config');
		}
		this.baseQuery = this.config.baseQuery;

		const storeQuerySnapshot = ngrxJsonApiService['storeSnapshot'].queries[this.config.queryId];
		if (storeQuerySnapshot) {
			this.latestQuery = storeQuerySnapshot.query;
			this.baseQuery = storeQuerySnapshot['query'];
		}

		this.result$ = this.ngrxJsonApiService
			.selectManyResults(this.config.queryId, true)
			.do(it => {
				if (this.baseQuery === null) {
					this.baseQuery = it.query;
					this.latestQuery = it.query;
				}
			})
			.map(result => {
				// query not available until load event trigger by PrimeNG
				// return empty object in that case
				if (result) {
					return result;
				}
				else {
					const emptyResult: ManyQueryResult = {
						query: null,
						loading: false,
						resultIds: [],
						meta: {},
						links: {},
						data: [],
						errors: []
					};
					return emptyResult;
				}
			});
	}

	public refresh() {
		this.ngrxJsonApiService.refreshQuery(this.config.queryId);
	}

	public onLazyLoad(event: LazyLoadEvent) {
		const offset = event.first;
		const limit = event.rows;
		const filters: Array<FilteringParam> = [];
		const sorting: Array<SortingParam> = [];
		const includes: Array<string> = [];

		if (event.multiSortMeta) {
			for (const sortMeta of event.multiSortMeta) {
				const direction = sortMeta.order === -1 ? Direction.DESC : Direction.ASC;
				sorting.push({direction: direction, api: this.utils.toSearchPath(sortMeta.field)});
			}
		}
		else if (event.sortField) {
			const direction = event.sortOrder === -1 ? Direction.DESC : Direction.ASC;
			sorting.push({direction: direction, api: this.utils.toSearchPath(event.sortField)});
		}
		if (event.filters) {
			for (const filterKey of Object.keys(event.filters)) {
				const filterMeta = event.filters[filterKey];
				let matchMode = filterMeta.matchMode;
				let value = filterMeta.value;
				if (!matchMode) {
					matchMode = 'like';
				}
				if (matchMode === 'like') {
					value = '%' + value + '%';
				}
				const attributePath = this.utils.toSearchPath(filterKey);
				filters.push({value: value, path: attributePath, operator: matchMode});
			}
		}

		if (!this.baseQuery) {
			throw new Error('illegal state, base query not available');
		}

		const query = _.cloneDeep(this.baseQuery);
		this.utils.applyQueryParams(query, {
			limit: limit,
			offset: offset,
			include: includes,
			sorting: sorting,
			filtering: filters
		});

		this.num++;

		if (!_.isEqual(query, this.latestQuery)) {
			this.ngrxJsonApiService.putQuery({
					query: query,
					fromServer: true
				}
			);
			this.latestQuery = query;
		}
	}
}
